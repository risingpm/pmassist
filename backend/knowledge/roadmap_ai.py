from textwrap import dedent
import json
import uuid
import re
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas
from backend.models import Project, Roadmap, RoadmapConversation
from backend.rbac import ensure_project_access, ensure_membership
from backend.knowledge_base_service import ensure_workspace_kb, get_kb_context_entries
from backend.workspaces import get_project_in_workspace
from backend.template_service import get_template_version
from backend.ai_guardrails import bundle_context_entries, render_context_block, verify_citations
from backend.ai_providers import get_openai_client
from backend.agent_defaults import get_default_roadmap_agent

logger = logging.getLogger(__name__)

DEFAULT_SUGGESTIONS = {
    "vision": [
        "We want to solve...",
        "Our strategic focus is...",
        "The customer pain is...",
    ],
    "persona": [
        "Primary persona is...",
        "Target user segment includes...",
    ],
    "personas": [
        "Primary persona is...",
        "Target user segment includes...",
    ],
    "outcomes": [
        "Key metrics to move are...",
        "Success looks like...",
    ],
    "constraints": [
        "We must respect...",
        "Dependencies include...",
    ],
    "timeline": [
        "We need MVP by...",
        "Full rollout expected in...",
    ],
    "risks": [
        "Top risks are...",
        "Unknowns we should highlight...",
    ],
}


FOLLOWUP_QUESTIONS = {
    "vision": "What core problem are you solving, and what outcome should this roadmap drive for the business?",
    "personas": "Who are the primary users and what jobs are they trying to get done?",
    "outcomes": "What 3-5 success metrics should we move with this roadmap?",
    "timeline": "What timeline should we optimize for (for example, MVP target and full rollout window)?",
    "constraints": "Any major constraints or risks to plan around (team capacity, dependencies, compliance, budget)?",
}


GENERATE_HINT_PATTERN = re.compile(
    r"\b(generate|draft|create|build|make|ship|finalize|give me|show me)\b.*\b(roadmap)\b|\broadmap\b.*\b(now|please|today)\b",
    re.IGNORECASE,
)
ASSUMPTION_OK_PATTERN = re.compile(
    r"\b(use assumptions|make assumptions|you decide|your call|go ahead|best guess|fill in the gaps)\b",
    re.IGNORECASE,
)

ROADMAP_TURN_PLANNER_PROMPT = dedent(
    """
    You are an expert product manager planning roadmap discovery conversations.
    Decide whether to ask one focused follow-up question or generate the roadmap now.
    Be specific, concise, and context-aware.

    Return ONLY JSON in this exact shape:
    {
      "action": "ask_followup" | "present_roadmap",
      "message": "string",
      "suggestions": ["string", "string", "string"]
    }

    Rules:
    - Ask at most one question at a time.
    - Prioritize missing strategic clarity: vision/problem, personas/JTBD, success metrics, timeline, constraints/risks.
    - If the user explicitly asks to generate now, choose present_roadmap unless context is near-empty.
    - Never ask vague/redundant questions.
    """
).strip()

ROADMAP_GENERATOR_PROMPT = dedent(
    """
    You are a pragmatic senior product manager. Generate a clear roadmap in Markdown.
    Requirements:
    - Output valid Markdown only.
    - Include headings: "## MVP", "## Phase 2", "## Phase 3".
    - Each phase must include concrete, execution-oriented bullet points.
    - Include "## Success Metrics" and "## Constraints and Risks".
    - Infer reasonable assumptions where needed.
    """
).strip()


def _extract_json_object(raw: str) -> dict[str, object] | None:
    cleaned = (raw or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None

def build_context_block(project: Project, knowledge_section: str) -> str:
    lines = [
        f"Project Title: {project.title}",
        f"Description: {project.description}",
        f"Goals: {project.goals}",
        f"North Star Metric: {project.north_star_metric or 'Not specified'}",
        f"Website or Key URL: {project.website_url or 'Not provided'}",
        f"Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}",
        "",
        "Knowledge Base Context:",
    ]
    lines.append(knowledge_section or "No knowledge base entries yet")
    return "\n".join(lines)


def build_workspace_context_block(workspace: models.Workspace, knowledge_section: str) -> str:
    lines = [
        f"Workspace Name: {workspace.name}",
        "Workspace context:",
        knowledge_section or "No knowledge base entries yet",
    ]
    return "\n".join(lines)


def store_conversation(db: Session, project_id: str, messages: list[schemas.RoadmapChatMessage]) -> None:
    db.query(RoadmapConversation).filter(RoadmapConversation.project_id == project_id).delete()
    for msg in messages:
        db.add(
            RoadmapConversation(
                id=uuid.uuid4(),
                project_id=project_id,
                message_role=msg.role,
                message_content=msg.content,
            )
        )
    db.commit()


def upsert_roadmap(db: Session, project: Project, content: str) -> Roadmap:
    current = (
        db.query(Roadmap)
        .filter(Roadmap.project_id == project.id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if current:
        current.is_active = False
        db.add(current)
    roadmap = Roadmap(
        id=uuid.uuid4(),
        project_id=project.id,
        content=content,
        is_active=True,
        workspace_id=project.workspace_id,
    )
    db.add(roadmap)
    db.commit()
    db.refresh(roadmap)
    return roadmap


def _normalize_context_tag(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _load_tagged_entries(
    db: Session,
    workspace_id: UUID,
    context_tag: str | None,
    *,
    limit: int = 12,
) -> list[models.KnowledgeBaseEntry]:
    normalized = _normalize_context_tag(context_tag)
    if not normalized:
        return []
    kb = ensure_workspace_kb(db, workspace_id)
    return (
        db.query(models.KnowledgeBaseEntry)
        .filter(
            models.KnowledgeBaseEntry.kb_id == kb.id,
            models.KnowledgeBaseEntry.tags.contains([normalized]),
        )
        .order_by(models.KnowledgeBaseEntry.created_at.desc())
        .limit(limit)
        .all()
    )


def _merge_context_entries(
    tagged_entries: list[models.KnowledgeBaseEntry],
    search_entries: list[models.KnowledgeBaseEntry],
) -> list[models.KnowledgeBaseEntry]:
    ordered: list[models.KnowledgeBaseEntry] = []
    seen: set[UUID] = set()
    for entry in tagged_entries + search_entries:
        if entry.id in seen:
            continue
        ordered.append(entry)
        seen.add(entry.id)
    return ordered


def _fallback_roadmap_markdown(scope_title: str, prompt: str) -> str:
    cleaned_prompt = (prompt or "").strip()
    raw_points = re.split(r"[.\n;]+", cleaned_prompt)
    points = [item.strip(" -\t") for item in raw_points if item.strip(" -\t")]
    if not points:
        points = [
            f"Define the primary user problem for {scope_title}.",
            "Align on target users and top JTBD.",
            "Prioritize the first release scope.",
            "Set measurable outcomes for launch.",
        ]

    def pick(start: int, length: int) -> list[str]:
        subset: list[str] = []
        idx = start
        while len(subset) < length:
            point = points[idx % len(points)]
            if point not in subset:
                subset.append(point)
            idx += 1
        return subset

    mvp = pick(0, 4)
    phase2 = pick(1, 4)
    phase3 = pick(2, 4)

    return dedent(
        f"""
        # Roadmap: {scope_title}

        ## MVP
        - Validate the core workflow with an end-to-end happy path.
        - {mvp[0]}
        - {mvp[1]}
        - {mvp[2]}
        - Instrument product analytics and baseline dashboards.

        ## Phase 2
        - Improve reliability, quality, and UX polish for key flows.
        - {phase2[0]}
        - {phase2[1]}
        - {phase2[2]}
        - Expand integrations and automation for repeatable execution.

        ## Phase 3
        - Scale adoption with advanced capabilities and governance.
        - {phase3[0]}
        - {phase3[1]}
        - {phase3[2]}
        - Optimize performance and operational efficiency.

        ## Success Metrics
        - Weekly active usage on core workflow.
        - Task/flow completion rate.
        - Time-to-value from onboarding to first success.
        - Retention and repeat usage by target users.
        - Qualitative satisfaction from stakeholder feedback.
        """
    ).strip()


def _extract_roadmap_inputs(history: list[schemas.RoadmapChatMessage], user_prompt: str) -> dict[str, list[str]]:
    text_chunks = [msg.content.strip() for msg in history if msg.role == "user" and msg.content.strip()]
    if user_prompt.strip():
        text_chunks.append(user_prompt.strip())
    full_text = "\n".join(text_chunks)
    raw_parts = [part.strip(" -\t") for part in re.split(r"[.\n;]+", full_text) if part.strip(" -\t")]
    parts = []
    for part in raw_parts:
        normalized = re.sub(r"\s+", " ", part).strip()
        if normalized:
            parts.append(normalized)

    buckets: dict[str, list[str]] = {
        "vision": [],
        "personas": [],
        "outcomes": [],
        "constraints": [],
        "timeline": [],
    }
    for part in parts:
        lower = part.lower()
        if any(word in lower for word in ["persona", "user", "customer", "jira", "stakeholder", "buyer"]):
            buckets["personas"].append(part)
        elif any(word in lower for word in ["metric", "kpi", "success", "adoption", "retention", "time", "nps"]):
            buckets["outcomes"].append(part)
        elif any(word in lower for word in ["risk", "constraint", "dependency", "compliance", "budget", "resource"]):
            buckets["constraints"].append(part)
        elif any(word in lower for word in ["q1", "q2", "q3", "q4", "month", "week", "deadline", "mvp by", "launch"]):
            buckets["timeline"].append(part)
        else:
            buckets["vision"].append(part)
    return buckets


def _choose_followup_slot(inputs: dict[str, list[str]]) -> str | None:
    priority = ["vision", "personas", "outcomes", "timeline", "constraints"]
    for slot in priority:
        if not inputs.get(slot):
            return slot
    return None


def _plan_roadmap_turn(history: list[schemas.RoadmapChatMessage], prompt: str) -> dict[str, object]:
    inputs = _extract_roadmap_inputs(history, prompt)
    filled = {slot: bool(values) for slot, values in inputs.items()}
    coverage = sum(1 for is_filled in filled.values() if is_filled)

    latest_text = prompt.strip()
    explicit_generate = bool(GENERATE_HINT_PATTERN.search(latest_text))
    allow_assumptions = bool(ASSUMPTION_OK_PATTERN.search(latest_text))

    must_have = {"vision", "personas", "outcomes"}
    has_core = all(filled.get(slot, False) for slot in must_have)

    should_present = False
    if has_core and coverage >= 4:
        should_present = True
    elif explicit_generate and coverage >= 2:
        should_present = True
    elif allow_assumptions and coverage >= 1:
        should_present = True

    if should_present:
        return {
            "action": "present_roadmap",
            "message": "Roadmap draft generated. You can ask me to revise scope, sequencing, or metrics.",
            "suggestions": DEFAULT_SUGGESTIONS["outcomes"][:3],
        }

    next_slot = _choose_followup_slot(inputs) or "vision"
    return {
        "action": "ask_followup",
        "message": FOLLOWUP_QUESTIONS[next_slot],
        "suggestions": DEFAULT_SUGGESTIONS.get(next_slot, DEFAULT_SUGGESTIONS["vision"])[:3],
    }


def _plan_roadmap_turn_smart(
    db: Session,
    workspace_id: UUID,
    *,
    history: list[schemas.RoadmapChatMessage],
    prompt: str,
    context_block: str,
) -> dict[str, object]:
    heuristic_plan = _plan_roadmap_turn(history, prompt)
    try:
        agent = get_default_roadmap_agent(db, workspace_id)
        client = get_openai_client(db, workspace_id)
        model_name = agent.model_name if agent and agent.model_name else "gpt-4o-mini"
        messages = [
            {"role": "system", "content": ROADMAP_TURN_PLANNER_PROMPT},
            {
                "role": "user",
                "content": (
                    "Current context:\n"
                    f"{context_block}\n\n"
                    "Conversation so far:\n"
                    + "\n".join(f"{m.role}: {m.content}" for m in history[-12:])
                    + "\n\n"
                    f"Latest user message:\n{prompt}\n\n"
                    "Return planner JSON now."
                ),
            },
        ]
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.2,
            timeout=18,
        )
        parsed = _extract_json_object(response.choices[0].message.content or "")
        if not parsed:
            return heuristic_plan
        action = str(parsed.get("action") or "").strip().lower()
        message = str(parsed.get("message") or "").strip()
        suggestions_raw = parsed.get("suggestions")
        suggestions: list[str] = []
        if isinstance(suggestions_raw, list):
            suggestions = [str(item).strip() for item in suggestions_raw if str(item).strip()][:3]
        if action not in {"ask_followup", "present_roadmap"} or not message:
            return heuristic_plan
        if not suggestions:
            suggestions = list(heuristic_plan.get("suggestions") or DEFAULT_SUGGESTIONS["vision"][:3])
        return {
            "action": action,
            "message": message,
            "suggestions": suggestions,
        }
    except Exception as exc:
        logger.warning("Roadmap turn planner fallback to heuristic for workspace %s: %s", workspace_id, exc)
        return heuristic_plan


def _ensure_revision_question(message: str, *, workspace_scope: bool = False) -> str:
    base = (message or "").strip()
    lowered = base.lower()
    has_question = "?" in base
    mentions_change = any(token in lowered for token in ["change", "revise", "adjust", "update", "modify"])
    if has_question and mentions_change:
        return base
    suffix = (
        " What would you like to change in this roadmap?"
        if workspace_scope
        else " What would you like to change in this roadmap draft?"
    )
    if not base:
        return suffix.strip()
    return f"{base.rstrip('.')}." + suffix


def _normalize_persona_line(value: str) -> str:
    lower = value.lower()
    if "jira users" in lower or (("jira" in lower) and "user" in lower):
        return "Product managers, engineering managers, scrum masters, and team leads running agile delivery workflows."
    return value


def _build_deterministic_roadmap_markdown(
    *,
    scope_title: str,
    user_prompt: str,
    history: list[schemas.RoadmapChatMessage],
    template_hint: str | None = None,
) -> str:
    buckets = _extract_roadmap_inputs(history, user_prompt)
    vision = buckets["vision"][:4]
    personas = [_normalize_persona_line(item) for item in buckets["personas"][:4]]
    outcomes = buckets["outcomes"][:5]
    constraints = buckets["constraints"][:4]
    timeline = buckets["timeline"][:3]

    if not vision:
        vision = [f"Deliver a focused {scope_title} experience that solves a painful workflow bottleneck."]
    if not personas:
        personas = [
            "Primary users are cross-functional product and engineering teams managing planning and execution.",
            "Secondary users include leadership stakeholders who need clear delivery visibility and risk status.",
        ]
    if not outcomes:
        outcomes = [
            "Increase weekly active usage of the core workflow.",
            "Reduce cycle time from planning to delivery.",
            "Improve completion rates on planned milestones.",
            "Raise team satisfaction with planning and progress visibility.",
        ]
    if not constraints:
        constraints = [
            "Keep MVP scope narrow with clear acceptance criteria.",
            "Prioritize reliability, observability, and data quality from day one.",
            "Sequence dependencies early to avoid delivery bottlenecks.",
        ]

    timeline_note = timeline[0] if timeline else "Use a 3-phase sequence: validation, scale, and optimization."
    template_section = f"\n## Template Alignment\n- {template_hint}\n" if template_hint else ""

    return dedent(
        f"""
        # Roadmap: {scope_title}

        ## Strategic Direction
        - {vision[0]}
        - {vision[1] if len(vision) > 1 else "Translate strategy into a prioritized roadmap with explicit tradeoffs."}
        - {timeline_note}

        ## Target Personas
        - {personas[0]}
        - {personas[1] if len(personas) > 1 else "Teams coordinating backlog grooming, sprint planning, and release execution."}
        - {personas[2] if len(personas) > 2 else "Operational stakeholders monitoring velocity, risks, and delivery confidence."}

        ## MVP
        - Define and ship the end-to-end core workflow with clear ownership and status visibility.
        - Implement role-based views for the primary personas and their top jobs-to-be-done.
        - Add baseline analytics for adoption, engagement, and time-to-value.
        - Create execution guardrails: quality checks, issue triage, and risk escalation paths.
        - Run pilot rollout with a small user cohort and close feedback loops weekly.

        ## Phase 2
        - Expand automation and integrations for high-frequency operational workflows.
        - Improve prioritization, planning cadence, and dependency management.
        - Strengthen collaboration surfaces across product, engineering, and operations.
        - Add deeper reporting for delivery predictability and outcome trends.
        - Harden reliability and scalability based on pilot learning.

        ## Phase 3
        - Optimize cross-team orchestration with advanced insights and proactive recommendations.
        - Introduce governance controls, auditability, and enterprise-readiness.
        - Personalize experiences by role, team maturity, and workflow context.
        - Operationalize continuous improvement with quarterly roadmap recalibration.
        - Scale adoption through enablement, onboarding, and self-serve best practices.

        ## Success Metrics
        - {outcomes[0]}
        - {outcomes[1] if len(outcomes) > 1 else "Improve activation rate from signup to first successful workflow."}
        - {outcomes[2] if len(outcomes) > 2 else "Increase retained users over 30/60/90 day windows."}
        - {outcomes[3] if len(outcomes) > 3 else "Reduce blocked work and dependency-related delays."}
        - {outcomes[4] if len(outcomes) > 4 else "Improve stakeholder confidence in delivery planning and execution."}

        ## Constraints and Risks
        - {constraints[0]}
        - {constraints[1] if len(constraints) > 1 else "Avoid overloading early releases with low-value edge features."}
        - {constraints[2] if len(constraints) > 2 else "Track key risks weekly and define mitigation owners."}
        {template_section}
        """
    ).strip()


def _generate_roadmap_markdown(
    db: Session,
    workspace_id: UUID,
    *,
    context_prompt: str,
    history: list[schemas.RoadmapChatMessage],
    template_id: UUID | None,
    scope_title: str,
    user_prompt: str,
) -> str:
    template_hint: str | None = None
    if template_id:
        try:
            template, version = get_template_version(db, workspace_id, template_id)
            first_line = (version.content or "").strip().splitlines()
            lead = first_line[0] if first_line else "Use the selected template sections and ordering."
            template_hint = f"Use template '{template.title}': {lead[:180]}"
        except HTTPException:
            template_hint = None
    try:
        # Try LLM generation first for better roadmap quality; keep strict timeout.
        agent = get_default_roadmap_agent(db, workspace_id)
        client = get_openai_client(db, workspace_id)
        model_name = agent.model_name if agent and agent.model_name else "gpt-4o-mini"
        llm_messages: list[dict[str, str]] = [
            {"role": "system", "content": ROADMAP_GENERATOR_PROMPT},
            {"role": "user", "content": context_prompt},
        ]
        if template_hint:
            llm_messages.append(
                {
                    "role": "system",
                    "content": template_hint,
                }
            )
        llm_messages.extend({"role": msg.role, "content": msg.content} for msg in history)
        llm_response = client.chat.completions.create(
            model=model_name,
            messages=llm_messages,
            temperature=0.25,
            timeout=22,
        )
        llm_content = (llm_response.choices[0].message.content or "").strip()
        if llm_content:
            return llm_content
    except Exception as exc:
        logger.warning("Roadmap generator fallback to deterministic draft for workspace %s: %s", workspace_id, exc)
        pass
    try:
        return _build_deterministic_roadmap_markdown(
            scope_title=scope_title,
            user_prompt=user_prompt,
            history=history,
            template_hint=template_hint,
        )
    except Exception:
        return _fallback_roadmap_markdown(scope_title, user_prompt)


router = APIRouter(prefix="/projects", tags=["roadmap"])
workspace_router = APIRouter(prefix="/roadmaps", tags=["roadmap"])


def _record_roadmap_entry(db: Session, workspace_id: UUID | None, project_id: UUID, user_id: UUID, content: str) -> models.KnowledgeBaseEntry | None:
    if not workspace_id:
        return None
    kb = ensure_workspace_kb(db, workspace_id)
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="roadmap",
        title="Roadmap Draft",
        content=content,
        created_by=user_id,
        project_id=project_id,
        tags=["roadmap"],
    )
    db.add(entry)
    try:
        db.commit()
        db.refresh(entry)
        return entry
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to persist roadmap KB entry for project %s: %s", project_id, exc)
        return None


def _fetch_context_entries(
    db: Session,
    workspace_id: UUID,
    *,
    project_id: UUID | None,
    limit: int,
) -> list[models.KnowledgeBaseEntry]:
    # Local-first retrieval to avoid blocking roadmap generation on embedding calls.
    return get_kb_context_entries(db, workspace_id, limit=limit, project_id=project_id)


@router.post("/{project_id}/roadmap/generate", response_model=schemas.RoadmapGenerateResponse)
def generate_roadmap_endpoint(
    project_id: str,
    payload: schemas.RoadmapGenerateRequest,
    db: Session = Depends(get_db),
):
    if not payload.workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")
    if not payload.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    ensure_project_access(db, payload.workspace_id, UUID(project_id), payload.user_id, required_role="contributor")

    project = get_project_in_workspace(db, project_id, payload.workspace_id)
    history_messages = payload.conversation_history or []
    prompt = (payload.prompt or "").strip()
    if not prompt and not history_messages:
        raise HTTPException(status_code=400, detail="Prompt is required to start the conversation.")

    try:
        tagged_entries = _load_tagged_entries(db, project.workspace_id, payload.context_tag, limit=12)
        kb_entries = _fetch_context_entries(db, project.workspace_id, project_id=project.id, limit=5)
        context_bundle = bundle_context_entries(_merge_context_entries(tagged_entries, kb_entries))
    except Exception as exc:
        logger.warning("Failed to load project roadmap context for %s: %s", project.id, exc)
        context_bundle = []
    context_items = [item.to_schema() for item in context_bundle]
    knowledge_section = render_context_block(context_bundle)
    context_block = build_context_block(project, knowledge_section)
    allowed_markers = {item.marker for item in context_items if item.marker}

    effective_history = history_messages.copy()
    if prompt:
        effective_history.append(schemas.RoadmapChatMessage(role="user", content=prompt))

    turn_plan = _plan_roadmap_turn_smart(
        db,
        payload.workspace_id,
        history=effective_history,
        prompt=prompt,
        context_block=context_block,
    )
    if turn_plan["action"] == "ask_followup":
        assistant_message = str(turn_plan["message"])
        updated_history = effective_history + [
            schemas.RoadmapChatMessage(role="assistant", content=assistant_message)
        ]
        try:
            store_conversation(db, project_id, updated_history)
        except Exception as exc:
            db.rollback()
            logger.warning("Failed to persist roadmap follow-up conversation for %s: %s", project_id, exc)
        return schemas.RoadmapGenerateResponse(
            message=assistant_message,
            conversation_history=updated_history,
            roadmap=None,
            action="ask_followup",
            suggestions=list(turn_plan["suggestions"]) if isinstance(turn_plan.get("suggestions"), list) else DEFAULT_SUGGESTIONS["vision"][:3],
            context_entries=context_items,
            kb_entry_id=None,
            verification=schemas.VerificationDetails(status="skipped", message="No roadmap generated yet."),
        )

    roadmap_markdown = _generate_roadmap_markdown(
        db,
        payload.workspace_id,
        context_prompt=(
            f"Project context:\n{context_block}\n\n"
            "Generate a complete roadmap now."
        ),
        history=effective_history,
        template_id=payload.template_id,
        scope_title=project.title or "Project roadmap",
        user_prompt=prompt,
    )
    assistant_message = _ensure_revision_question(str(turn_plan["message"]))
    updated_history = effective_history + [
        schemas.RoadmapChatMessage(role="assistant", content=assistant_message)
    ]

    try:
        upsert_roadmap(db, project, roadmap_markdown)
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to persist project roadmap for %s: %s", project.id, exc)
    verification = verify_citations([assistant_message, roadmap_markdown], allowed_markers)
    try:
        store_conversation(db, project_id, updated_history)
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to persist roadmap conversation for %s: %s", project_id, exc)

    kb_entry_id = None
    entry = _record_roadmap_entry(db, project.workspace_id, UUID(project_id), payload.user_id, roadmap_markdown)
    if entry:
        kb_entry_id = entry.id

    return schemas.RoadmapGenerateResponse(
        message=assistant_message,
        conversation_history=updated_history,
        roadmap=roadmap_markdown,
        action="present_roadmap",
        suggestions=list(turn_plan["suggestions"]) if isinstance(turn_plan.get("suggestions"), list) else DEFAULT_SUGGESTIONS["outcomes"][:3],
        context_entries=context_items,
        kb_entry_id=kb_entry_id,
        verification=verification,
    )


def generate_workspace_roadmap(payload: schemas.RoadmapGenerateRequest, db: Session) -> schemas.RoadmapGenerateResponse:
    workspace = db.query(models.Workspace).filter(models.Workspace.id == payload.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    history_messages = payload.conversation_history or []
    prompt = (payload.prompt or "").strip()
    if not prompt and not history_messages:
        raise HTTPException(status_code=400, detail="Prompt is required to start the conversation.")

    try:
        tagged_entries = _load_tagged_entries(db, workspace.id, payload.context_tag, limit=12)
        kb_entries = _fetch_context_entries(db, workspace.id, project_id=None, limit=5)
        context_bundle = bundle_context_entries(_merge_context_entries(tagged_entries, kb_entries))
    except Exception as exc:
        logger.warning("Failed to load workspace roadmap context for %s: %s", workspace.id, exc)
        context_bundle = []
    context_items = [item.to_schema() for item in context_bundle]
    knowledge_section = render_context_block(context_bundle)
    context_block = build_workspace_context_block(workspace, knowledge_section)
    allowed_markers = {item.marker for item in context_items if item.marker}

    effective_history = history_messages.copy()
    if prompt:
        effective_history.append(schemas.RoadmapChatMessage(role="user", content=prompt))

    turn_plan = _plan_roadmap_turn_smart(
        db,
        workspace.id,
        history=effective_history,
        prompt=prompt,
        context_block=context_block,
    )
    if turn_plan["action"] == "ask_followup":
        assistant_message = str(turn_plan["message"])
        updated_history = effective_history + [
            schemas.RoadmapChatMessage(role="assistant", content=assistant_message)
        ]
        return schemas.RoadmapGenerateResponse(
            message=assistant_message,
            conversation_history=updated_history,
            roadmap=None,
            action="ask_followup",
            suggestions=list(turn_plan["suggestions"]) if isinstance(turn_plan.get("suggestions"), list) else DEFAULT_SUGGESTIONS["vision"][:3],
            context_entries=context_items,
            kb_entry_id=None,
            verification=schemas.VerificationDetails(status="skipped", message="No roadmap generated yet."),
        )

    roadmap_markdown = _generate_roadmap_markdown(
        db,
        workspace.id,
        context_prompt=(
            f"Workspace context:\n{context_block}\n\n"
            "Generate a complete workspace roadmap now."
        ),
        history=effective_history,
        template_id=payload.template_id,
        scope_title=f"{workspace.name} roadmap",
        user_prompt=prompt,
    )
    assistant_message = _ensure_revision_question(
        str(turn_plan["message"]).replace("Roadmap draft generated", "Workspace roadmap draft generated"),
        workspace_scope=True,
    )
    updated_history = effective_history + [
        schemas.RoadmapChatMessage(role="assistant", content=assistant_message)
    ]

    try:
        current = (
            db.query(Roadmap)
            .filter(Roadmap.project_id.is_(None), Roadmap.workspace_id == workspace.id, Roadmap.is_active == True)
            .order_by(Roadmap.created_at.desc())
            .first()
        )
        if current:
            current.is_active = False
            db.add(current)
        roadmap = Roadmap(
            id=uuid.uuid4(),
            project_id=None,
            workspace_id=workspace.id,
            content=roadmap_markdown,
            is_active=True,
        )
        db.add(roadmap)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to persist workspace roadmap for %s: %s", workspace.id, exc)
    verification = verify_citations([assistant_message, roadmap_markdown], allowed_markers)

    return schemas.RoadmapGenerateResponse(
        message=assistant_message,
        conversation_history=updated_history,
        roadmap=roadmap_markdown,
        action="present_roadmap",
        suggestions=list(turn_plan["suggestions"]) if isinstance(turn_plan.get("suggestions"), list) else DEFAULT_SUGGESTIONS["timeline"][:3],
        context_entries=context_items,
        kb_entry_id=None,
        verification=verification,
    )


@workspace_router.post("/workspace/generate", response_model=schemas.RoadmapGenerateResponse)
def generate_workspace_roadmap_endpoint(
    payload: schemas.RoadmapGenerateRequest,
    db: Session = Depends(get_db),
):
    if not payload.workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")
    if not payload.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    return generate_workspace_roadmap(payload, db=db)


@workspace_router.get("/workspace", response_model=schemas.RoadmapContentResponse)
def get_workspace_roadmap(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id.is_(None), Roadmap.workspace_id == workspace_id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        return schemas.RoadmapContentResponse(
            content="",
            updated_at=None,
        )
    return schemas.RoadmapContentResponse(
        content=roadmap.content,
        updated_at=roadmap.updated_at or roadmap.created_at,
    )


@workspace_router.get("/workspace/list", response_model=list[schemas.RoadmapSummary])
def list_workspace_roadmaps(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    roadmaps = (
        db.query(Roadmap, Project)
        .outerjoin(Project, Roadmap.project_id == Project.id)
        .filter(Roadmap.workspace_id == workspace_id)
        .order_by(Roadmap.updated_at.desc().nullslast(), Roadmap.created_at.desc())
        .limit(50)
        .all()
    )
    summaries: list[schemas.RoadmapSummary] = []
    for roadmap, project in roadmaps:
        title = project.title if project and project.title else "Workspace roadmap"
        summaries.append(
            schemas.RoadmapSummary(
                id=roadmap.id,
                project_id=roadmap.project_id,
                workspace_id=roadmap.workspace_id,
                title=title,
                updated_at=roadmap.updated_at or roadmap.created_at,
            )
        )
    return summaries


@workspace_router.delete("/workspace", status_code=204)
def delete_workspace_roadmap(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id.is_(None), Roadmap.workspace_id == workspace_id)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    db.delete(roadmap)
    db.commit()
    return Response(status_code=204)


@workspace_router.put("/workspace")
def update_workspace_roadmap(
    payload: schemas.RoadmapUpdateRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    current = (
        db.query(Roadmap)
        .filter(Roadmap.project_id.is_(None), Roadmap.workspace_id == workspace_id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if current:
        current.is_active = False
        db.add(current)

    roadmap = Roadmap(
        id=uuid.uuid4(),
        project_id=None,
        workspace_id=workspace_id,
        content=payload.content,
        is_active=True,
    )
    db.add(roadmap)
    db.commit()
    db.refresh(roadmap)
    return {
        "id": str(roadmap.id),
        "updated_at": (roadmap.updated_at or roadmap.created_at).isoformat(),
    }


@router.get("/{project_id}/roadmap", response_model=schemas.RoadmapContentResponse)
def get_saved_roadmap(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    roadmap = (
        db.query(Roadmap)
        .filter(
            Roadmap.project_id == project_id,
            Roadmap.workspace_id == workspace_id,
            Roadmap.is_active == True,
        )
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        raise HTTPException(status_code=404, detail="No roadmap found")
    return schemas.RoadmapContentResponse(
        content=roadmap.content,
        updated_at=roadmap.updated_at or roadmap.created_at,
    )


@router.delete("/{project_id}/roadmap", status_code=204)
def delete_project_roadmap(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="editor")
    roadmap = (
        db.query(Roadmap)
        .filter(
            Roadmap.project_id == project_id,
            Roadmap.workspace_id == workspace_id,
        )
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    db.delete(roadmap)
    db.commit()
    return Response(status_code=204)


@router.put("/{project_id}/roadmap")
def update_roadmap(
    project_id: str,
    payload: schemas.RoadmapUpdateRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    roadmap = upsert_roadmap(db, project, payload.content)
    return {
        "id": str(roadmap.id),
        "updated_at": (roadmap.updated_at or roadmap.created_at).isoformat(),
    }
