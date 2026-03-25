from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from uuid import UUID
from urllib.parse import urlparse
import json
import difflib
import re
from .database import get_db
from . import models, schemas
from .workspaces import get_project_in_workspace
from backend.rbac import ensure_membership, ensure_project_access
from backend.knowledge_base_service import ensure_workspace_kb, get_relevant_entries, update_entry_embedding
from backend.ai_providers import metered_chat_completion, resolve_openai_chat_model
from backend.project_research import _fetch_website_text, normalize_project_website
from backend.template_service import get_template_version
from backend.ai_guardrails import DECLINE_PHRASE, bundle_context_entries, render_context_block, verify_citations
from backend.prd_service import (
    next_prd_version,
    refresh_prd_embeddings,
    create_decision_embedding,
    search_prd_embeddings,
    build_prd_context_items,
)
from backend.workspace_memory import remember_workspace_event
from backend.agent_defaults import get_default_prd_agent

from fastapi.responses import FileResponse
from docx import Document as DocxDocument
import tempfile
from dotenv import load_dotenv

# 🔑 Load environment variables
load_dotenv()

router = APIRouter(
    prefix="/projects",
    tags=["prds"]
)
workspace_router = APIRouter(
    prefix="/prds",
    tags=["prds"]
)
embeddings_router = APIRouter(
    prefix="/embeddings",
    tags=["prd-embeddings"],
)


def _context_payload(entries: list[models.KnowledgeBaseEntry]) -> tuple[list[schemas.KnowledgeBaseContextItem], str, set[str]]:
    bundle = bundle_context_entries(entries)
    context_items = [item.to_schema() for item in bundle]
    context_block = render_context_block(bundle)
    allowed_markers = {item.marker for item in context_items if item.marker}
    return context_items, context_block, allowed_markers


def _project_context_block(project: models.Project) -> str:
    return "\n".join(
        [
            f"Project Title: {project.title or 'Not provided'}",
            f"Description: {project.description or 'Not provided'}",
            f"Goals: {project.goals or 'Not specified'}",
            f"North Star Metric: {project.north_star_metric or 'Not specified'}",
            f"Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}",
            f"Website or Key URL: {project.website_url or 'Not provided'}",
        ]
    )


def _serialize_kb_entry(entry: models.KnowledgeBaseEntry) -> schemas.KnowledgeBaseEntryResponse:
    file_url = None
    if entry.file_path:
        file_url = f"/knowledge-base/entries/{entry.id}/download"
    return schemas.KnowledgeBaseEntryResponse(
        id=entry.id,
        kb_id=entry.kb_id,
        type=entry.type,
        title=entry.title,
        content=entry.content,
        file_url=file_url,
        source_url=entry.source_url,
        created_by=entry.created_by,
        created_by_email=entry.creator.email if entry.creator else None,
        project_id=entry.project_id,
        tags=entry.tags or [],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _record_prd_entry(db: Session, workspace_id: UUID | None, prd: models.PRD, user_id: UUID | None) -> None:
    if not workspace_id:
        return
    kb = ensure_workspace_kb(db, workspace_id)
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="prd",
        title=prd.feature_name or prd.project.title if prd.project else "PRD",
        content=prd.content,
        created_by=user_id,
        project_id=prd.project_id,
        tags=["prd"],
    )
    db.add(entry)
    db.commit()
    snippet = (prd.content or "")[:600]
    remember_workspace_event(
        db,
        workspace_id,
        content=f"PRD update for {prd.feature_name or 'PRD'} v{prd.version}:\n{snippet}",
        source="prd",
        metadata={
            "project_id": str(prd.project_id) if prd.project_id else None,
            "prd_id": str(prd.id),
            "version": prd.version,
        },
        tags=["prd"],
        user_id=user_id,
    )


def _record_prd_messages(
    db: Session,
    *,
    prd: models.PRD,
    workspace_id: UUID,
    user_id: UUID,
    user_message: str,
    assistant_message: str,
) -> None:
    db.add(
        models.PRDChatMessage(
            prd_id=prd.id,
            project_id=prd.project_id,
            workspace_id=workspace_id,
            role="user",
            content=user_message,
            created_by=user_id,
        )
    )
    db.add(
        models.PRDChatMessage(
            prd_id=prd.id,
            project_id=prd.project_id,
            workspace_id=workspace_id,
            role="assistant",
            content=assistant_message,
            created_by=None,
        )
    )


def _get_recent_prd_chat_context(
    db: Session,
    *,
    prd_id: UUID,
    limit: int = 8,
) -> str:
    rows = (
        db.query(models.PRDChatMessage)
        .filter(models.PRDChatMessage.prd_id == prd_id)
        .order_by(models.PRDChatMessage.created_at.desc())
        .limit(max(1, min(limit, 20)))
        .all()
    )
    if not rows:
        return "No prior chat context."
    lines: list[str] = []
    for row in reversed(rows):
        role = "User" if row.role == "user" else "Assistant"
        text = (row.content or "").strip()
        if len(text) > 500:
            text = f"{text[:500]}..."
        if text:
            lines.append(f"{role}: {text}")
    return "\n".join(lines) if lines else "No prior chat context."


def _get_prd_note_entries(
    db: Session,
    *,
    workspace_id: UUID,
    prd_id: UUID | None = None,
    project_id: UUID | None = None,
    limit: int = 6,
) -> list[models.KnowledgeBaseEntry]:
    kb = ensure_workspace_kb(db, workspace_id)
    query = (
        db.query(models.KnowledgeBaseEntry)
        .filter(models.KnowledgeBaseEntry.kb_id == kb.id)
        .filter(models.KnowledgeBaseEntry.tags.contains(["note"]))
    )
    prd_tag_filters = [models.KnowledgeBaseEntry.tags.contains(["prd:pending"])]
    if prd_id:
        prd_tag_filters.append(models.KnowledgeBaseEntry.tags.contains([f"prd:{prd_id}"]))
    if project_id:
        query = query.filter(
            or_(
                models.KnowledgeBaseEntry.project_id == project_id,
                *prd_tag_filters,
            )
        )
    else:
        query = query.filter(or_(*prd_tag_filters))
    return query.order_by(models.KnowledgeBaseEntry.created_at.desc()).limit(limit).all()


def _merge_context_entries(
    entries: list[models.KnowledgeBaseEntry],
    extra_entries: list[models.KnowledgeBaseEntry],
) -> list[models.KnowledgeBaseEntry]:
    seen: set[UUID] = set()
    merged: list[models.KnowledgeBaseEntry] = []
    for entry in entries + extra_entries:
        if entry.id in seen:
            continue
        seen.add(entry.id)
        merged.append(entry)
    return merged


def _is_context_question(message: str) -> bool:
    lowered = message.lower()
    if re.search(r"\bnotes?\b", lowered) and re.search(
        r"\b(based|added|use|using|consider|include|included|reflect|reflected|from)\b", lowered
    ):
        return True
    return any(
        phrase in lowered
        for phrase in [
            "did you understand",
            "did you read",
            "did you see",
            "use the note",
            "use my note",
            "use the notes",
            "use my notes",
            "consider the note",
            "consider my note",
            "consider the notes",
            "consider my notes",
            "note i added",
            "notes i added",
            "context i added",
            "context note",
            "based on notes",
            "based on the notes",
            "from the notes",
            "from my notes",
        ]
    )


def _build_context_ack(notes: list[models.KnowledgeBaseEntry]) -> str:
    if not notes:
        return "I do not see any PRD notes yet. Add a note and I will use it in the next draft."
    seen: set[tuple[str, str]] = set()
    lines = []
    for note in notes:
        title = (note.title or "").strip()
        content = (note.content or "").strip()
        key = (title, content)
        if key in seen:
            continue
        seen.add(key)
        snippet = content if len(content) <= 120 else f"{content[:120]}…"
        lines.append(f"- {title}: {snippet}")
        if len(lines) >= 3:
            break
    return "Got it. I will use these notes in the PRD:\n" + "\n".join(lines)


def _note_usage_response(prd_content: str | None, notes: list[models.KnowledgeBaseEntry]) -> str:
    if not notes:
        return "I do not see any PRD notes yet. Add a note and I will use it in the next draft."
    if not prd_content:
        return (
            "I have your notes saved, but the PRD has not been generated yet. "
            "Say “generate PRD” and I will incorporate the notes."
        )
    summary_lines = []
    content_lower = prd_content.lower()
    for note in notes:
        title = (note.title or "Note").strip()
        content = (note.content or "").strip()
        tokens = [word for word in re.split(r"[^a-zA-Z0-9]+", content.lower()) if len(word) >= 5]
        matched = any(token in content_lower for token in tokens[:6])
        if matched:
            summary_lines.append(f"- {title}: reflected in the draft.")
        else:
            summary_lines.append(f"- {title}: not yet reflected in the draft.")
    return "Here’s how your notes map to the current draft:\n" + "\n".join(summary_lines)


def _format_note_block(notes: list[models.KnowledgeBaseEntry], limit: int = 6) -> str:
    if not notes:
        return "None"
    seen: set[tuple[str, str]] = set()
    lines: list[str] = []
    for note in notes:
        title = (note.title or "Note").strip()
        content = (note.content or "").strip()
        key = (title, content)
        if key in seen:
            continue
        seen.add(key)
        snippet = content if len(content) <= 220 else f"{content[:220]}…"
        lines.append(f"- {title}: {snippet}")
        if len(lines) >= limit:
            break
    return "\n".join(lines)


def _build_prd_system_prompt(
    agent: models.AIAgent | None,
    base_prompt: str | None = None,
) -> str:
    parts: list[str] = []
    if agent and agent.instructions:
        parts.append(agent.instructions.strip())
        if agent.purpose:
            parts.append(f"Purpose: {agent.purpose}")
        if agent.tone:
            parts.append(f"Tone: {agent.tone}")
    if base_prompt:
        parts.append(base_prompt.strip())
    if not parts:
        return "You are an expert product manager who writes PRDs."
    return "\n\n".join(part for part in parts if part)


def _resolve_prd_agent_settings(
    db: Session,
    workspace_id: UUID,
    *,
    default_temperature: float,
) -> tuple[models.AIAgent | None, str, float, int | None]:
    agent = get_default_prd_agent(db, workspace_id)
    model_name = resolve_openai_chat_model(agent.model_name if agent and agent.model_name else None)
    temperature = agent.temperature if agent and agent.temperature is not None else default_temperature
    max_tokens = agent.max_tokens if agent and agent.max_tokens else None
    return agent, model_name, temperature, max_tokens


def _call_prd_assistant(
    db: Session,
    workspace_id: UUID,
    *,
    system_prompt: str,
    user_prompt: str,
    user_id: UUID | None = None,
) -> str:
    agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
        db,
        workspace_id,
        default_temperature=0.4,
    )
    system_prompt = _build_prd_system_prompt(agent, system_prompt)
    kwargs = {}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = metered_chat_completion(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        feature="prd.assistant",
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        **kwargs,
    )
    return response.choices[0].message.content or ""


def _extract_urls(text: str) -> list[str]:
    raw_urls = re.findall(r"https?://[^\s)\\]]+", text, flags=re.IGNORECASE)
    cleaned = []
    for url in raw_urls:
        trimmed = url.rstrip(").,;!?\"'")
        normalized = normalize_project_website(trimmed)
        if normalized:
            cleaned.append(normalized)
    return cleaned


def _is_research_request(message: str) -> bool:
    lowered = message.lower()
    if "http://" not in lowered and "https://" not in lowered:
        return False
    keywords = [
        "research",
        "summarize",
        "summary",
        "look up",
        "browse",
        "analyze",
        "review",
        "scan",
        "visit",
        "pull from",
    ]
    return any(keyword in lowered for keyword in keywords)


def _store_research_entry(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID,
    url: str,
    content: str,
    project_id: UUID | None = None,
) -> models.KnowledgeBaseEntry:
    kb = ensure_workspace_kb(db, workspace_id)
    title = f"Web research: {urlparse(url).netloc}"
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="research",
        title=title,
        content=f"Source: {url}\n\n{content}",
        source_url=url,
        project_id=project_id,
        tags=["research", "web"],
        created_by=user_id,
    )
    db.add(entry)
    db.flush()
    update_entry_embedding(db, entry, workspace_id=workspace_id, text_override=content)
    return entry


def _summarize_research(
    db: Session,
    workspace_id: UUID,
    *,
    url: str,
    content: str,
    prompt: str,
) -> str:
    system_prompt = (
        "You are a senior product manager. Summarize web research for PRD use. "
        "Return 4-6 bullet points: positioning, ICP, key features, differentiation, and any risks."
    )
    user_prompt = (
        f"User request: {prompt}\n\n"
        f"Source URL: {url}\n\n"
        f"Website content:\n{content}"
    )
    return _call_prd_assistant(db, workspace_id, system_prompt=system_prompt, user_prompt=user_prompt)


_TRIGGER_PATTERNS = [
    re.compile(r"\b(generate|create|draft|build|write)\s+prd\b", re.IGNORECASE),
    re.compile(r"\bprd\b.*\b(generate|create|draft|build|write)\b", re.IGNORECASE),
]

_GREETING_PATTERNS = [
    re.compile(r"^(hi|hey|hello|yo|sup|hiya|good\\s+(morning|afternoon|evening))\\b", re.IGNORECASE),
    re.compile(r"^hi[,!\\s]*$", re.IGNORECASE),
]

_REFINE_PATTERNS = [
    re.compile(r"\\b(more detail|more detailed|expand|elaborate|flesh out|add detail|add more|improve|revise|refine|clarify|make it better)\\b", re.IGNORECASE),
    re.compile(r"\\b(go deeper|add specifics|add implementation|add steps|add workflow)\\b", re.IGNORECASE),
]

_INFO_BUCKETS = {
    "problem": ["problem", "pain", "issue", "challenge", "friction", "gap"],
    "user": ["user", "customer", "persona", "buyer", "audience", "team", "role"],
    "outcome": ["goal", "objective", "outcome", "success", "metric", "kpi", "impact", "result"],
}


def _should_generate_prd(prompt: str, feature_name: str | None, settings: dict[str, object]) -> bool:
    normalized = (prompt or "").strip().lower()
    if not normalized:
        return False
    if _is_greeting(prompt, settings):
        return False
    if any(pattern.search(normalized) for pattern in _TRIGGER_PATTERNS):
        return True
    score = 0
    for keywords in _INFO_BUCKETS.values():
        if any(keyword in normalized for keyword in keywords):
            score += 1
    if feature_name:
        score += 1
    min_score = int(settings.get("min_signal_score", 2) or 2)
    min_len = int(settings.get("min_signal_length", 60) or 60)
    return score >= min_score or len(normalized) >= min_len


def _build_intake_question(settings: dict[str, object]) -> str:
    default_message = (
        "Happy to help. Before I draft the PRD, can you share a bit more?\n"
        "- What problem are we solving?\n"
        "- Who is the target user?\n"
        "- What outcome or success metric matters most?\n"
        "If you want me to draft right away, just say “generate PRD.”"
    )
    return str(settings.get("intake_questions") or default_message)


def _is_greeting(prompt: str, settings: dict[str, object]) -> bool:
    normalized = (prompt or "").strip().lower()
    if not normalized:
        return False
    if len(normalized) > 40:
        return False
    if settings.get("greeting_enabled") is False:
        return False
    return any(pattern.search(normalized) for pattern in _GREETING_PATTERNS)


def _is_refinement_request(prompt: str) -> bool:
    normalized = (prompt or "").strip().lower()
    if not normalized:
        return False
    return any(pattern.search(normalized) for pattern in _REFINE_PATTERNS)


def _build_greeting_response() -> str:
    return (
        "Hey! I can help you draft a PRD, define the problem and target users, clarify success metrics, "
        "outline scope and requirements, and refine sections as we go. "
        "Share your product idea and I’ll generate a PRD to start."
    )


def _get_prd_settings(agent: models.AIAgent | None) -> dict[str, object]:
    defaults: dict[str, object] = {
        "greeting_enabled": True,
        "ask_followup_enabled": True,
        "tone": "senior_pm",
        "output_format": "PRD",
        "verbosity": 3,
        "bullet_density": "medium",
        "section_guidance": {},
        "engine_instructions": "",
        "custom_fields": [],
        "intake_questions": (
            "Happy to help. Before I draft the PRD, can you share a bit more?\n"
            "- What problem are we solving?\n"
            "- Who is the target user?\n"
            "- What outcome or success metric matters most?\n"
            "If you want me to draft right away, just say “generate PRD.”"
        ),
        "sections": [
            "Objective",
            "Scope",
            "Success Metrics",
            "Engineering Requirements",
            "Future Work",
        ],
        "require_markdown": True,
        "require_headers": True,
        "require_bullets": True,
        "require_citations": True,
        "allow_best_effort": True,
        "include_workspace_knowledge": True,
        "include_notes": True,
        "include_project_fields": True,
        "include_templates": True,
        "include_prior_prds": True,
        "include_website": True,
        "min_signal_length": 60,
        "min_signal_score": 2,
    }
    if not agent:
        return defaults
    config = dict(agent.context_config or {})
    prd_settings = config.get("prd_settings") or {}
    if isinstance(prd_settings, dict):
        defaults.update(prd_settings)
    return defaults


def _format_prd_engine_directives(settings: dict[str, object]) -> str:
    lines: list[str] = []
    tone = settings.get("tone")
    output_format = settings.get("output_format")
    verbosity = settings.get("verbosity")
    bullet_density = settings.get("bullet_density")
    engine_instructions = settings.get("engine_instructions")
    if tone:
        lines.append(f"- Tone: {tone}")
    if output_format:
        lines.append(f"- Output format: {output_format}")
    if isinstance(verbosity, (int, float)):
        lines.append(f"- Verbosity level (1 concise → 5 detailed): {verbosity}")
    if bullet_density:
        lines.append(f"- Bullet density: {bullet_density}")
    if engine_instructions:
        lines.append(f"- Additional instructions: {engine_instructions}")
    section_guidance = settings.get("section_guidance") or {}
    if isinstance(section_guidance, dict) and section_guidance:
        lines.append("- Section guidance:")
        for key, value in section_guidance.items():
            if key and value:
                lines.append(f"  - {key}: {value}")
    custom_fields = settings.get("custom_fields") or []
    if isinstance(custom_fields, list) and custom_fields:
        lines.append("- Custom controls (treat defaults as constraints when applicable):")
        for field in custom_fields:
            if not isinstance(field, dict):
                continue
            label = field.get("label") or field.get("key") or "Custom field"
            field_type = field.get("type") or "text"
            required = "required" if field.get("required") else "optional"
            default_value = field.get("default")
            option_text = ""
            options = field.get("options")
            if isinstance(options, list) and options:
                option_text = f" Options: {', '.join([str(option) for option in options])}."
            if default_value:
                lines.append(
                    f"  - {label} ({field_type}, {required}). Default: {default_value}.{option_text}"
                )
            else:
                lines.append(f"  - {label} ({field_type}, {required}).{option_text}")
    return "\n".join(lines)


def _merge_prompt(base: str | None, followup: str | None) -> str:
    parts = [part.strip() for part in [base, followup] if part and part.strip()]
    return "\n\n".join(parts)


@workspace_router.post("", response_model=schemas.PRDResponse)
def generate_prd_without_project(
    prd_data: schemas.PRDCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = get_default_prd_agent(db, workspace_id)
    prd_settings = _get_prd_settings(agent)
    agent = get_default_prd_agent(db, workspace_id)
    prd_settings = _get_prd_settings(agent)

    if _is_greeting(prd_data.prompt, prd_settings):
        greeting_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager assistant. Respond warmly and briefly, "
                "then ask for the product idea in one sentence."
            ),
            user_prompt=f"User message: {prd_data.prompt}",
        )
        new_prd = models.PRD(
            project_id=None,
            workspace_id=workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=greeting_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(new_prd)
        response_schema.assistant_message = greeting_message
        return response_schema

    if _is_research_request(prd_data.prompt):
        urls = _extract_urls(prd_data.prompt)
        if not urls:
            message = _call_prd_assistant(
                db,
                workspace_id,
                system_prompt="You are a senior product manager. Ask the user to share a URL to research.",
                user_prompt=f"User message: {prd_data.prompt}",
            )
            new_prd = models.PRD(
                project_id=None,
                workspace_id=workspace_id,
                feature_name=prd_data.feature_name,
                description=prd_data.prompt,
                content=None,
                version=1,
                is_active=True,
                created_by=user_id,
            )
            db.add(new_prd)
            db.commit()
            db.refresh(new_prd)
            _record_prd_messages(
                db,
                prd=new_prd,
                workspace_id=workspace_id,
                user_id=user_id,
                user_message=prd_data.prompt,
                assistant_message=message,
            )
            db.commit()
            response_schema = schemas.PRDResponse.model_validate(new_prd)
            response_schema.assistant_message = message
            return response_schema

        url = urls[0]
        content = _fetch_website_text(url)
        if not content:
            message = _call_prd_assistant(
                db,
                workspace_id,
                system_prompt="You are a senior product manager. Explain that the URL could not be accessed.",
                user_prompt=f"User message: {prd_data.prompt}\nURL: {url}",
            )
        else:
            _store_research_entry(
                db,
                workspace_id=workspace_id,
                user_id=user_id,
                url=url,
                content=content,
            )
            db.commit()
            message = _summarize_research(db, workspace_id, url=url, content=content, prompt=prd_data.prompt)

        new_prd = models.PRD(
            project_id=None,
            workspace_id=workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(new_prd)
        response_schema.assistant_message = message
        return response_schema

    if _is_context_question(prd_data.prompt):
        notes = (
            _get_prd_note_entries(db, workspace_id=workspace_id)
            if prd_settings.get("include_notes") is not False
            else []
        )
        notes_block = _format_note_block(notes)
        context_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Answer user questions using the provided notes. "
                "If no draft exists, say you will apply the notes when generating the PRD."
            ),
            user_prompt=(
                "Notes:\n"
                f"{notes_block}\n\n"
                f"User question: {prd_data.prompt}"
            ),
        )
        new_prd = models.PRD(
            project_id=None,
            workspace_id=workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=context_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(new_prd)
        response_schema.assistant_message = context_message
        return response_schema

    if (
        prd_settings.get("ask_followup_enabled") is not False
        and not _should_generate_prd(prd_data.prompt, prd_data.feature_name, prd_settings)
    ):
        intake_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=_build_intake_question(prd_settings),
            user_prompt=f"User message: {prd_data.prompt}",
        )
        new_prd = models.PRD(
            project_id=None,
            workspace_id=workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=intake_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(new_prd)
        response_schema.assistant_message = intake_message
        return response_schema

    context_query = "\n".join(filter(None, [prd_data.feature_name, prd_data.prompt]))
    kb_entries = (
        get_relevant_entries(db, workspace_id, context_query, top_n=5)
        if prd_settings.get("include_workspace_knowledge") is not False
        else []
    )
    note_entries = (
        _get_prd_note_entries(db, workspace_id=workspace_id)
        if prd_settings.get("include_notes") is not False
        else []
    )
    merged_entries = _merge_context_entries(kb_entries, note_entries)
    context_items, context_block, allowed_markers = _context_payload(merged_entries)

    template_section = ""
    if getattr(prd_data, "template_id", None) and prd_settings.get("include_templates") is not False:
        try:
            template, version = get_template_version(db, workspace_id, prd_data.template_id)
            template_section = (
                f"\nUse the following template structure titled '{template.title}':\n{version.content}\n"
            )
        except HTTPException:
            template_section = ""

    sections = prd_settings.get("sections") or []
    if not isinstance(sections, list):
        sections = []
    section_lines = (
        "\n".join([f"- {section}" for section in sections])
        if sections
        else "- Objective\n- Scope\n- Success Metrics\n- Engineering Requirements\n- Future Work"
    )

    best_effort_line = (
        "provide a best-effort PRD using the provided idea, persona assumptions, and industry best practices."
        if prd_settings.get("allow_best_effort", True)
        else f'reply with "{DECLINE_PHRASE}".'
    )
    directives = _format_prd_engine_directives(prd_settings)
    directives_line = f"- PRD engine directives:\n{directives}" if directives else ""
    prompt = f"""
Generate a Product Requirements Document (PRD){' in **Markdown** format' if prd_settings.get('require_markdown', True) else ''}.

Always use {'Markdown headers, lists, and bullet points' if prd_settings.get('require_markdown', True) else 'clear headings and bullets'}.
Include these sections:
{section_lines}

Project Context: Not provided (draft PRD without a project).

Workspace Knowledge Base:
{context_block}

Guidance:
- Cite workspace references inline using their markers like [CTX1] when applicable.
- If the knowledge base lacks direct evidence, {best_effort_line}
{directives_line}

Task: Generate a PRD for feature: {prd_data.feature_name}
User instructions: {prd_data.prompt}
{template_section}
"""

    agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
        db,
        workspace_id,
        default_temperature=0.4,
    )
    system_prompt = _build_prd_system_prompt(agent, "You are an expert product manager who writes PRDs.")
    kwargs = {}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = metered_chat_completion(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        feature="prd.generate.workspace",
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        **kwargs,
    )

    raw_content = response.choices[0].message.content
    if prd_settings.get("require_citations") is not False:
        if prd_settings.get("require_citations") is not False:
            verification = verify_citations([raw_content], allowed_markers)
        else:
            verification = None
    else:
        verification = None

    new_prd = models.PRD(
        project_id=None,
        workspace_id=workspace_id,
        feature_name=prd_data.feature_name,
        description=prd_data.prompt,
        content=raw_content,
        version=1,
        is_active=True,
        created_by=user_id,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)

    _record_prd_messages(
        db,
        prd=new_prd,
        workspace_id=workspace_id,
        user_id=user_id,
        user_message=prd_data.prompt,
        assistant_message=raw_content,
    )
    _record_prd_entry(db, workspace_id, new_prd, user_id)
    db.commit()

    response_schema = schemas.PRDResponse.model_validate(new_prd)
    response_schema.context_entries = context_items
    response_schema.verification = verification
    return response_schema


@workspace_router.put("/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd_without_project(
    prd_id: UUID,
    refine_data: schemas.PRDRefine,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    agent = get_default_prd_agent(db, workspace_id)
    prd_settings = _get_prd_settings(agent)

    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id.is_(None),
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    template_section = ""
    if getattr(refine_data, "template_id", None) and prd_settings.get("include_templates") is not False:
        try:
            template, version = get_template_version(db, workspace_id, refine_data.template_id)
            template_section = (
                f"\nUse the following template structure titled '{template.title}':\n{version.content}\n"
            )
        except HTTPException:
            template_section = ""

    if _is_greeting(refine_data.instructions, prd_settings):
        greeting_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager assistant. Respond warmly and briefly, "
                "then ask for the product idea in one sentence."
            ),
            user_prompt=f"User message: {refine_data.instructions}",
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=greeting_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(prd)
        response_schema.assistant_message = greeting_message
        return response_schema

    if _is_research_request(refine_data.instructions):
        urls = _extract_urls(refine_data.instructions)
        if not urls:
            message = _call_prd_assistant(
                db,
                workspace_id,
                system_prompt="You are a senior product manager. Ask the user to share a URL to research.",
                user_prompt=f"User message: {refine_data.instructions}",
            )
        else:
            url = urls[0]
            content = _fetch_website_text(url)
            if not content:
                message = _call_prd_assistant(
                    db,
                    workspace_id,
                    system_prompt="You are a senior product manager. Explain that the URL could not be accessed.",
                    user_prompt=f"User message: {refine_data.instructions}\nURL: {url}",
                )
            else:
                _store_research_entry(
                    db,
                    workspace_id=workspace_id,
                    user_id=user_id,
                    url=url,
                    content=content,
                )
                db.commit()
                message = _summarize_research(db, workspace_id, url=url, content=content, prompt=refine_data.instructions)

        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(prd)
        response_schema.assistant_message = message
        return response_schema

    if _is_context_question(refine_data.instructions):
        notes = _get_prd_note_entries(db, workspace_id=workspace_id, prd_id=prd.id)
        notes_block = _format_note_block(notes)
        context_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Answer the question using the notes and draft. "
                "Be specific about what was incorporated and what is missing."
            ),
            user_prompt=(
                f"Notes:\n{notes_block}\n\nDraft:\n{prd.content or 'No draft yet.'}\n\n"
                f"User question: {refine_data.instructions}"
            ),
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=context_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(prd)
        response_schema.assistant_message = context_message
        return response_schema

    if prd.content is None:
        combined_prompt = _merge_prompt(prd.description, refine_data.instructions)
        conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)
        context_query = "\n".join(filter(None, [prd.feature_name, combined_prompt]))
        kb_entries = (
            get_relevant_entries(db, workspace_id, context_query, top_n=5)
            if prd_settings.get("include_workspace_knowledge") is not False
            else []
        )
        note_entries = (
            _get_prd_note_entries(db, workspace_id=workspace_id, prd_id=prd.id)
            if prd_settings.get("include_notes") is not False
            else []
        )
        merged_entries = _merge_context_entries(kb_entries, note_entries)
        context_items, context_block, allowed_markers = _context_payload(merged_entries)

        sections = prd_settings.get("sections") or []
        if not isinstance(sections, list):
            sections = []
        section_lines = (
            "\n".join([f"- {section}" for section in sections])
            if sections
            else "- Objective\n- Scope\n- Success Metrics\n- Engineering Requirements\n- Future Work"
        )

        best_effort_line = (
            "provide a best-effort PRD using the provided idea, persona assumptions, and industry best practices."
            if prd_settings.get("allow_best_effort", True)
            else f'reply with "{DECLINE_PHRASE}".'
        )
        directives = _format_prd_engine_directives(prd_settings)
        directives_line = f"- PRD engine directives:\n{directives}" if directives else ""
        prompt = f"""
Generate a Product Requirements Document (PRD){' in **Markdown** format' if prd_settings.get('require_markdown', True) else ''}.

Always use {'Markdown headers, lists, and bullet points' if prd_settings.get('require_markdown', True) else 'clear headings and bullets'}.
Include these sections:
{section_lines}

Project Context: Not provided (draft PRD without a project).

Workspace Knowledge Base:
{context_block}

Recent PRD chat context:
{conversation_context}

Guidance:
- Cite workspace references inline using their markers like [CTX1] when applicable.
- If the knowledge base lacks direct evidence, {best_effort_line}
{directives_line}

Task: Generate a PRD for feature: {prd.feature_name}
User instructions: {combined_prompt}
{template_section}
"""

        agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
            db,
            workspace_id,
            default_temperature=0.4,
        )
        system_prompt = _build_prd_system_prompt(agent, "You are an expert product manager who writes PRDs.")
        kwargs = {}
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = metered_chat_completion(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature="prd.refine.workspace",
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            **kwargs,
        )

        raw_content = response.choices[0].message.content
        if prd_settings.get("require_citations") is not False:
            verification = verify_citations([raw_content], allowed_markers)
        else:
            verification = None

        new_version = next_prd_version(db, prd.project_id, workspace_id)
        refined_prd = models.PRD(
            project_id=None,
            workspace_id=workspace_id,
            feature_name=prd.feature_name,
            description=combined_prompt,
            goals=prd.goals,
            content=raw_content,
            version=new_version,
            is_active=True,
            created_by=user_id,
        )
        prd.is_active = False
        db.add(refined_prd)
        db.commit()
        db.refresh(refined_prd)

        _record_prd_messages(
            db,
            prd=refined_prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=raw_content,
        )
        _record_prd_entry(db, workspace_id, refined_prd, user_id)
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(refined_prd)
        response_schema.context_entries = context_items
        response_schema.verification = verification
        return response_schema

    if (
        prd_settings.get("ask_followup_enabled") is not False
        and not _is_refinement_request(refine_data.instructions)
        and not _should_generate_prd(refine_data.instructions, prd.feature_name, prd_settings)
    ):
        workspace_context = "Workspace Context: General workspace PRD (no specific project attached)."
        conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)
        context_query = "\n".join(
            filter(
                None,
                [
                    prd.feature_name,
                    refine_data.instructions,
                    prd.content,
                    conversation_context,
                ],
            )
        )
        kb_entries = get_relevant_entries(
            db,
            workspace_id,
            context_query,
            top_n=5,
        )
        note_entries = _get_prd_note_entries(
            db,
            workspace_id=workspace_id,
            prd_id=prd.id,
        )
        merged_entries = _merge_context_entries(kb_entries, note_entries)
        _, context_block, _ = _context_payload(merged_entries)
        intake_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Ask 2-3 concise clarifying questions "
                "to improve the PRD draft. Keep it friendly and brief."
            ),
            user_prompt=(
                f"{workspace_context}\n\n"
                f"Recent PRD chat context:\n{conversation_context}\n\n"
                f"Workspace Knowledge Base:\n{context_block}\n\n"
                f"User message: {refine_data.instructions}\n\n"
                "Ask clarifying questions that reference the existing PRD and workspace context when possible."
            ),
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=intake_message,
        )
        db.commit()
        response_schema = schemas.PRDResponse.model_validate(prd)
        response_schema.assistant_message = intake_message
        return response_schema

    previous_prds = (
        db.query(models.PRD)
        .filter(
            models.PRD.project_id.is_(None),
            models.PRD.id != prd_id,
            models.PRD.workspace_id == workspace_id,
        )
        .order_by(models.PRD.version.desc())
        .limit(5)
        .all()
    )
    previous_prds_text = "\n---\n".join([p.content or "" for p in previous_prds]) if previous_prds else "None"
    conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)
    refine_query = "\n".join(filter(None, [prd.feature_name, refine_data.instructions, prd.content]))
    kb_entries = get_relevant_entries(db, workspace_id, refine_query, top_n=5)
    note_entries = _get_prd_note_entries(db, workspace_id=workspace_id, prd_id=prd.id)
    merged_entries = _merge_context_entries(kb_entries, note_entries)
    note_block = _context_payload(merged_entries)[1] if merged_entries else "None"

    prompt = f"""
You are an expert product manager who refines PRDs in clean Markdown format.

Other PRDs for reference:
{previous_prds_text}

Workspace knowledge base and PRD notes:
{note_block}

Recent PRD chat context:
{conversation_context}

Here is the current PRD to refine:
{prd.content or ''}

Refinement instructions:
{refine_data.instructions}

Please update the PRD accordingly while preserving its structure, goals, and context.
{template_section}
"""

    agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
        db,
        workspace_id,
        default_temperature=0.4,
    )
    system_prompt = _build_prd_system_prompt(agent, "You refine PRDs with clear, concise Markdown.")
    kwargs = {}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = metered_chat_completion(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        feature="prd.refine.current.workspace",
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        **kwargs,
    )

    raw_content = response.choices[0].message.content

    new_version = next_prd_version(db, prd.project_id, workspace_id)
    refined_prd = models.PRD(
        project_id=None,
        workspace_id=workspace_id,
        feature_name=prd.feature_name,
        description=prd.description,
        goals=prd.goals,
        content=raw_content,
        version=new_version,
        is_active=True,
        created_by=user_id,
    )
    prd.is_active = False
    db.add(refined_prd)
    db.commit()
    db.refresh(refined_prd)

    _record_prd_messages(
        db,
        prd=refined_prd,
        workspace_id=workspace_id,
        user_id=user_id,
        user_message=refine_data.instructions,
        assistant_message=raw_content,
    )
    _record_prd_entry(db, workspace_id, refined_prd, user_id)
    db.commit()
    return schemas.PRDResponse.model_validate(refined_prd)


def _create_prd_note_entry(
    db: Session,
    *,
    workspace_id: UUID,
    user_id: UUID,
    content: str,
    title: str | None = None,
    prd: models.PRD | None = None,
    tags: list[str] | None = None,
) -> models.KnowledgeBaseEntry:
    kb = ensure_workspace_kb(db, workspace_id)
    note_title = (title or "PRD Note").strip() or "PRD Note"
    note_tags = ["prd", "note"]
    if prd:
        note_tags.append(f"prd:{prd.id}")
    else:
        note_tags.append("prd:pending")
    if tags:
        note_tags.extend([tag for tag in tags if tag])
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="insight",
        title=note_title,
        content=content,
        created_by=user_id,
        project_id=prd.project_id if prd else None,
        tags=note_tags,
    )
    db.add(entry)
    db.flush()
    update_entry_embedding(db, entry, workspace_id=workspace_id, text_override=content)
    return entry


@workspace_router.post("/{prd_id}/save", response_model=schemas.PRDResponse)
def save_prd_without_project(
    prd_id: UUID,
    payload: schemas.PRDSaveRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")

    base_prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id.is_(None),
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not base_prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    max_version = next_prd_version(db, base_prd.project_id, workspace_id)
    base_prd.is_active = False
    new_prd = models.PRD(
        project_id=None,
        workspace_id=workspace_id,
        feature_name=payload.feature_name or base_prd.feature_name,
        description=payload.description or base_prd.description,
        goals=base_prd.goals,
        content=payload.content,
        version=max_version,
        is_active=True,
        created_by=user_id,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)
    _record_prd_entry(db, workspace_id, new_prd, user_id)
    db.commit()
    return schemas.PRDResponse.model_validate(new_prd)


@workspace_router.post("/{prd_id}/notes", response_model=schemas.KnowledgeBaseEntryResponse)
def add_prd_note(
    prd_id: UUID,
    payload: schemas.PRDNoteCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.workspace_id == workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Note content is required")
    entry = _create_prd_note_entry(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        content=content,
        title=payload.title,
        prd=prd,
        tags=payload.tags,
    )
    db.commit()
    db.refresh(entry)
    return _serialize_kb_entry(entry)


@workspace_router.post("/notes", response_model=schemas.KnowledgeBaseEntryResponse)
def add_workspace_prd_note(
    payload: schemas.PRDNoteCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Note content is required")
    prd = None
    if payload.prd_id:
        prd = (
            db.query(models.PRD)
            .filter(models.PRD.id == payload.prd_id, models.PRD.workspace_id == workspace_id)
            .first()
        )
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")
    entry = _create_prd_note_entry(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        content=content,
        title=payload.title,
        prd=prd,
        tags=payload.tags,
    )
    db.commit()
    db.refresh(entry)
    return _serialize_kb_entry(entry)


@workspace_router.post("/{prd_id}/attach-project", response_model=schemas.PRDResponse)
def attach_prd_to_project(
    prd_id: UUID,
    payload: schemas.PRDProjectAttachRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    ensure_project_access(db, workspace_id, payload.project_id, user_id, required_role="contributor")
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.workspace_id == workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    prd.project_id = payload.project_id
    db.add(prd)

    kb = ensure_workspace_kb(db, workspace_id)
    entries = (
        db.query(models.KnowledgeBaseEntry)
        .filter(models.KnowledgeBaseEntry.kb_id == kb.id)
        .filter(models.KnowledgeBaseEntry.project_id.is_(None))
        .filter(models.KnowledgeBaseEntry.created_by == user_id)
        .filter(
            or_(
                models.KnowledgeBaseEntry.tags.contains([f"prd:{prd_id}"]),
                models.KnowledgeBaseEntry.tags.contains(["prd:pending"]),
            )
        )
        .all()
    )
    for entry in entries:
        entry.project_id = payload.project_id
        tags = [tag for tag in (entry.tags or []) if tag != "prd:pending"]
        if f"prd:{prd_id}" not in tags:
            tags.append(f"prd:{prd_id}")
        entry.tags = tags
        db.add(entry)

    (
        db.query(models.PRDChatMessage)
        .filter(models.PRDChatMessage.prd_id == prd_id, models.PRDChatMessage.project_id.is_(None))
        .update({models.PRDChatMessage.project_id: payload.project_id})
    )

    db.commit()
    db.refresh(prd)
    return schemas.PRDResponse.model_validate(prd)


@workspace_router.get("", response_model=list[schemas.PRDListItem])
def list_workspace_prds(
    workspace_id: UUID,
    user_id: UUID,
    status: str | None = None,
    query: str | None = None,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    normalized_status = (status or "").strip().lower()
    message_counts = (
        db.query(
            models.PRDChatMessage.prd_id.label("prd_id"),
            func.count(models.PRDChatMessage.id).label("message_count"),
        )
        .filter(models.PRDChatMessage.workspace_id == workspace_id)
        .group_by(models.PRDChatMessage.prd_id)
        .subquery()
    )

    prds_query = (
        db.query(
            models.PRD,
            models.Project.title.label("project_title"),
            func.coalesce(message_counts.c.message_count, 0).label("message_count"),
        )
        .outerjoin(models.Project, models.Project.id == models.PRD.project_id)
        .outerjoin(message_counts, message_counts.c.prd_id == models.PRD.id)
        .filter(models.PRD.workspace_id == workspace_id, models.PRD.is_active.is_(True))
        .order_by(models.PRD.updated_at.desc())
    )

    if query:
        like_query = f"%{query.strip().lower()}%"
        prds_query = prds_query.filter(
            or_(
                func.lower(models.PRD.feature_name).like(like_query),
                func.lower(models.PRD.description).like(like_query),
                func.lower(models.Project.title).like(like_query),
            )
        )

    # Apply status filter in SQL so we do not fetch-and-filter all PRDs in Python.
    trimmed_content = func.nullif(func.btrim(func.coalesce(models.PRD.content, "")), "")
    if normalized_status == "draft":
        prds_query = prds_query.filter(trimmed_content.is_(None))
    elif normalized_status == "saved":
        prds_query = prds_query.filter(trimmed_content.isnot(None))

    rows = prds_query.all()
    items: list[schemas.PRDListItem] = []
    for prd, project_title, message_count in rows:
        status_label = "draft" if not (prd.content or "").strip() else "saved"
        items.append(
            schemas.PRDListItem(
                id=prd.id,
                project_id=prd.project_id,
                project_title=project_title,
                feature_name=prd.feature_name,
                description=prd.description,
                status=status_label,
                message_count=message_count,
                created_at=prd.created_at,
                updated_at=prd.updated_at,
            )
        )
    return items


@workspace_router.get("/{prd_id}/export")
def export_prd_without_project(
    prd_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id.is_(None),
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    doc = DocxDocument()
    doc.add_heading("Product Requirements Document (PRD)", level=0)
    doc.add_heading("Feature Name", level=1)
    doc.add_paragraph(prd.feature_name or "")
    doc.add_heading("Objective", level=1)
    doc.add_paragraph(prd.description or "")
    if hasattr(prd, "content") and prd.content:
        doc.add_heading("Full Markdown PRD", level=1)
        doc.add_paragraph(prd.content)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"PRD_{prd.id}.docx",
    )


@workspace_router.get("/{prd_id}", response_model=schemas.PRDResponse)
def get_workspace_prd(
    prd_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.workspace_id == workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    if prd.project_id:
        ensure_project_access(db, workspace_id, prd.project_id, user_id, required_role="viewer")
    return schemas.PRDResponse.model_validate(prd)


@workspace_router.delete("/{prd_id}", status_code=204)
def delete_workspace_prd(
    prd_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id.is_(None),
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    was_active = prd.is_active
    db.delete(prd)
    db.flush()

    if was_active:
        replacement = (
            db.query(models.PRD)
            .filter(
                models.PRD.project_id.is_(None),
                models.PRD.workspace_id == workspace_id,
            )
            .order_by(models.PRD.version.desc(), models.PRD.created_at.desc())
            .first()
        )
        if replacement:
            replacement.is_active = True

    db.commit()
    return Response(status_code=204)


@workspace_router.get("/{prd_id}/messages", response_model=list[schemas.PRDChatMessageResponse])
def list_prd_messages(
    prd_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.workspace_id == workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    if prd.project_id:
        ensure_project_access(db, workspace_id, prd.project_id, user_id, required_role="viewer")
    return (
        db.query(models.PRDChatMessage)
        .filter(
            models.PRDChatMessage.prd_id == prd_id,
            models.PRDChatMessage.workspace_id == workspace_id,
        )
        .order_by(models.PRDChatMessage.created_at.asc())
        .all()
    )


def _render_prd_context_block(items: list[schemas.KnowledgeBaseContextItem]) -> str:
    if not items:
        return "No PRD context provided."
    lines: list[str] = []
    for item in items:
        marker = item.marker or ""
        prefix = f"[{marker}] " if marker else ""
        lines.append(f"{prefix}{item.title} -> {item.snippet}")
    return "\n".join(lines)


def _side_by_side_diff(text_a: str | None, text_b: str | None) -> list[schemas.PRDDiffLine]:
    left_lines = (text_a or "").splitlines()
    right_lines = (text_b or "").splitlines()
    matcher = difflib.SequenceMatcher(None, left_lines, right_lines)
    diff: list[schemas.PRDDiffLine] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                diff.append(
                    schemas.PRDDiffLine(
                        type="equal",
                        left_line=left_lines[i1 + offset],
                        right_line=right_lines[j1 + offset],
                        left_number=i1 + offset + 1,
                        right_number=j1 + offset + 1,
                    )
                )
        elif tag == "replace":
            span = max(i2 - i1, j2 - j1)
            for offset in range(span):
                left_value = left_lines[i1 + offset] if i1 + offset < i2 else ""
                right_value = right_lines[j1 + offset] if j1 + offset < j2 else ""
                diff.append(
                    schemas.PRDDiffLine(
                        type="replace",
                        left_line=left_value or None,
                        right_line=right_value or None,
                        left_number=i1 + offset + 1 if i1 + offset < i2 else None,
                        right_number=j1 + offset + 1 if j1 + offset < j2 else None,
                    )
                )
        elif tag == "delete":
            for offset, line in enumerate(left_lines[i1:i2]):
                diff.append(
                    schemas.PRDDiffLine(
                        type="delete",
                        left_line=line,
                        left_number=i1 + offset + 1,
                    )
                )
        elif tag == "insert":
            for offset, line in enumerate(right_lines[j1:j2]):
                diff.append(
                    schemas.PRDDiffLine(
                        type="insert",
                        right_line=line,
                        right_number=j1 + offset + 1,
                    )
                )
    return diff

# -----------------------------
# Generate a new PRD (Markdown only)
# -----------------------------
@router.post("/{project_id}/prd", response_model=schemas.PRDResponse)
def generate_prd(
    project_id: str,
    prd_data: schemas.PRDCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    agent = get_default_prd_agent(db, workspace_id)
    prd_settings = _get_prd_settings(agent)
    project = get_project_in_workspace(db, project_id, workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if _is_greeting(prd_data.prompt, prd_settings):
        greeting_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager assistant. Respond warmly and briefly, "
                "then ask for the product idea in one sentence."
            ),
            user_prompt=f"User message: {prd_data.prompt}",
        )
        new_prd = models.PRD(
            project_id=project_id,
            workspace_id=project.workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            goals=project.goals,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=greeting_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(new_prd)
        response.assistant_message = greeting_message
        return response

    if _is_research_request(prd_data.prompt):
        urls = _extract_urls(prd_data.prompt)
        if not urls:
            message = _call_prd_assistant(
                db,
                workspace_id,
                system_prompt="You are a senior product manager. Ask the user to share a URL to research.",
                user_prompt=f"User message: {prd_data.prompt}",
            )
        else:
            url = urls[0]
            content = _fetch_website_text(url)
            if not content:
                message = _call_prd_assistant(
                    db,
                    workspace_id,
                    system_prompt="You are a senior product manager. Explain that the URL could not be accessed.",
                    user_prompt=f"User message: {prd_data.prompt}\nURL: {url}",
                )
            else:
                _store_research_entry(
                    db,
                    workspace_id=project.workspace_id,
                    user_id=user_id,
                    url=url,
                    content=content,
                    project_id=UUID(project_id),
                )
                db.commit()
                message = _summarize_research(db, workspace_id, url=url, content=content, prompt=prd_data.prompt)

        new_prd = models.PRD(
            project_id=project_id,
            workspace_id=project.workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            goals=project.goals,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(new_prd)
        response.assistant_message = message
        return response

    if _is_context_question(prd_data.prompt):
        notes = (
            _get_prd_note_entries(
                db,
                workspace_id=project.workspace_id,
                project_id=UUID(project_id),
            )
            if prd_settings.get("include_notes") is not False
            else []
        )
        notes_block = _format_note_block(notes)
        project_context = _project_context_block(project)
        context_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Answer user questions using the provided notes. "
                "If no draft exists, say you will apply the notes when generating the PRD."
            ),
            user_prompt=(
                f"{project_context}\n\n"
                "Notes:\n"
                f"{notes_block}\n\n"
                f"User question: {prd_data.prompt}"
            ),
        )
        new_prd = models.PRD(
            project_id=project_id,
            workspace_id=project.workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            goals=project.goals,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=context_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(new_prd)
        response.assistant_message = context_message
        return response

    if (
        prd_settings.get("ask_followup_enabled") is not False
        and not _should_generate_prd(prd_data.prompt, prd_data.feature_name, prd_settings)
    ):
        intake_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=_build_intake_question(prd_settings),
            user_prompt=f"User message: {prd_data.prompt}",
        )
        new_prd = models.PRD(
            project_id=project_id,
            workspace_id=project.workspace_id,
            feature_name=prd_data.feature_name,
            description=prd_data.prompt,
            goals=project.goals,
            content=None,
            version=1,
            is_active=True,
            created_by=user_id,
        )
        db.add(new_prd)
        db.commit()
        db.refresh(new_prd)
        _record_prd_messages(
            db,
            prd=new_prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=prd_data.prompt,
            assistant_message=intake_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(new_prd)
        response.assistant_message = intake_message
        return response

    context_query = "\n".join(
        filter(
            None,
            [
                project.title if prd_settings.get("include_project_fields", True) else None,
                project.description if prd_settings.get("include_project_fields", True) else None,
                project.goals if prd_settings.get("include_project_fields", True) else None,
                project.north_star_metric if prd_settings.get("include_project_fields", True) else None,
                prd_data.feature_name,
                prd_data.prompt,
            ],
        )
    )
    kb_entries = (
        get_relevant_entries(
            db,
            project.workspace_id,
            context_query,
            top_n=5,
            project_id=UUID(project_id),
        )
        if prd_settings.get("include_workspace_knowledge") is not False
        else []
    )
    note_entries = (
        _get_prd_note_entries(
            db,
            workspace_id=project.workspace_id,
            project_id=project_id,
        )
        if prd_settings.get("include_notes") is not False
        else []
    )
    merged_entries = _merge_context_entries(kb_entries, note_entries)
    context_items, context_block, allowed_markers = _context_payload(merged_entries)

    template_section = ""
    if getattr(prd_data, "template_id", None) and prd_settings.get("include_templates") is not False:
        try:
            template, version = get_template_version(db, workspace_id, prd_data.template_id)
            template_section = (
                f"\nUse the following template structure titled '{template.title}':\n{version.content}\n"
            )
        except HTTPException:
            template_section = ""

    # build prompt
    sections = prd_settings.get("sections") or []
    if not isinstance(sections, list):
        sections = []
    section_lines = (
        "\n".join([f"- {section}" for section in sections])
        if sections
        else "- Objective\n- Scope\n- Success Metrics\n- Engineering Requirements\n- Future Work"
    )

    prompt = f"""
Generate a Product Requirements Document (PRD){' in **Markdown** format' if prd_settings.get('require_markdown', True) else ''}.

Always use {'Markdown headers, lists, and bullet points' if prd_settings.get('require_markdown', True) else 'clear headings and bullets'}.
Include these sections:
{section_lines}

Project Title: {project.title if prd_settings.get('include_project_fields', True) else 'Not provided'}
Description: {project.description if prd_settings.get('include_project_fields', True) else 'Not provided'}
Goals: {project.goals if prd_settings.get('include_project_fields', True) else 'Not provided'}
North Star Metric: {project.north_star_metric or 'Not specified' if prd_settings.get('include_project_fields', True) else 'Not provided'}
Target Personas: {', '.join(project.target_personas or []) or 'Not specified' if prd_settings.get('include_project_fields', True) else 'Not provided'}
Website or Key URL: {project.website_url or 'Not provided' if prd_settings.get('include_website', True) else 'Not provided'}

Workspace Knowledge Base:
{context_block}

Guidance:
- Cite workspace references inline using their markers like [CTX1] when applicable.
- If the knowledge base lacks direct evidence, {best_effort_line}
- If a website is provided, synthesize positioning, ICP, and differentiators from it before drafting the PRD.
- Always tailor outputs to the project context and use the project name when helpful.
{directives_line}

Task: Generate a PRD for feature: {prd_data.feature_name}
User instructions: {prd_data.prompt}
{template_section}
"""

    agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
        db,
        workspace_id,
        default_temperature=0.4,
    )
    system_prompt = _build_prd_system_prompt(agent, "You are an expert product manager who writes PRDs.")
    kwargs = {}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = metered_chat_completion(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        feature="prd.generate.project",
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        **kwargs,
    )

    # ✅ FIX: use .content instead of ["content"]
    raw_content = response.choices[0].message.content
    if prd_settings.get("require_citations") is not False:
        verification = verify_citations([raw_content], allowed_markers)
    else:
        verification = None

    new_prd = models.PRD(
        project_id=project_id,
        workspace_id=project.workspace_id,
        feature_name=prd_data.feature_name,
        description=prd_data.prompt,
        goals=project.goals,
        content=raw_content,
        version=1,
        is_active=True,
        created_by=user_id,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)

    _record_prd_messages(
        db,
        prd=new_prd,
        workspace_id=project.workspace_id,
        user_id=user_id,
        user_message=prd_data.prompt,
        assistant_message=raw_content,
    )
    _record_prd_entry(db, project.workspace_id, new_prd, user_id)
    refresh_prd_embeddings(db, new_prd)
    db.commit()

    response = schemas.PRDResponse.model_validate(new_prd)
    response.context_entries = context_items
    response.verification = verification
    return response


# ---------------------------------------------------------
# ✅ Refine an existing PRD
# ---------------------------------------------------------
@router.put("/{project_id}/prds/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd(
    project_id: str,
    prd_id: UUID,
    refine_data: schemas.PRDRefine,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    agent = get_default_prd_agent(db, workspace_id)
    prd_settings = _get_prd_settings(agent)
    # Fetch the current PRD
    project = get_project_in_workspace(db, project_id, workspace_id)

    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    template_section = ""
    if getattr(refine_data, "template_id", None) and prd_settings.get("include_templates") is not False:
        try:
            template, version = get_template_version(db, workspace_id, refine_data.template_id)
            template_section = (
                f"\nUse the following template structure titled '{template.title}':\n{version.content}\n"
            )
        except HTTPException:
            template_section = ""

    if _is_greeting(refine_data.instructions, prd_settings):
        greeting_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager assistant. Respond warmly and briefly, "
                "then ask for the product idea in one sentence."
            ),
            user_prompt=f"User message: {refine_data.instructions}",
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=greeting_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(prd)
        response.assistant_message = greeting_message
        return response

    if _is_research_request(refine_data.instructions):
        urls = _extract_urls(refine_data.instructions)
        if not urls:
            message = _call_prd_assistant(
                db,
                workspace_id,
                system_prompt="You are a senior product manager. Ask the user to share a URL to research.",
                user_prompt=f"User message: {refine_data.instructions}",
            )
        else:
            url = urls[0]
            content = _fetch_website_text(url)
            if not content:
                message = _call_prd_assistant(
                    db,
                    workspace_id,
                    system_prompt="You are a senior product manager. Explain that the URL could not be accessed.",
                    user_prompt=f"User message: {refine_data.instructions}\nURL: {url}",
                )
            else:
                _store_research_entry(
                    db,
                    workspace_id=project.workspace_id,
                    user_id=user_id,
                    url=url,
                    content=content,
                    project_id=UUID(project_id),
                )
                db.commit()
                message = _summarize_research(db, workspace_id, url=url, content=content, prompt=refine_data.instructions)

        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(prd)
        response.assistant_message = message
        return response

    if _is_context_question(refine_data.instructions):
        notes = _get_prd_note_entries(
            db,
            workspace_id=project.workspace_id,
            prd_id=prd.id,
            project_id=UUID(project_id),
        )
        notes_block = _format_note_block(notes)
        project_context = _project_context_block(project)
        context_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Answer the question using the notes and draft. "
                "Be specific about what was incorporated and what is missing."
            ),
            user_prompt=(
                f"{project_context}\n\nNotes:\n{notes_block}\n\nDraft:\n{prd.content or 'No draft yet.'}\n\n"
                f"User question: {refine_data.instructions}"
            ),
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=context_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(prd)
        response.assistant_message = context_message
        return response

    if prd.content is None:
        combined_prompt = _merge_prompt(prd.description, refine_data.instructions)
        conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)
        context_query = "\n".join(
            filter(
                None,
                [
                    project.title,
                    project.description,
                    project.goals,
                    project.north_star_metric,
                    prd.feature_name,
                    combined_prompt,
                    conversation_context,
                ],
            )
        )
        kb_entries = get_relevant_entries(
            db,
            project.workspace_id,
            context_query,
            top_n=5,
            project_id=UUID(project_id),
        )
        note_entries = _get_prd_note_entries(
            db,
            workspace_id=project.workspace_id,
            prd_id=prd.id,
            project_id=UUID(project_id),
        )
        merged_entries = _merge_context_entries(kb_entries, note_entries)
        context_items, context_block, allowed_markers = _context_payload(merged_entries)

        prompt = f"""
Generate a Product Requirements Document (PRD) in **Markdown** format.

Always use Markdown headers, lists, and bullet points.
Include these sections:
- Objective
- Scope
- Success Metrics
- Engineering Requirements
- Future Work

Project Title: {project.title}
Description: {project.description}
Goals: {project.goals}
North Star Metric: {project.north_star_metric or 'Not specified'}
Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}
Website or Key URL: {project.website_url or 'Not provided'}

Workspace Knowledge Base:
{context_block}

Recent PRD chat context:
{conversation_context}

Guidance:
- Cite workspace references inline using their markers like [CTX1] when applicable.
- If the knowledge base lacks direct evidence, provide a best-effort PRD using the project description, goals, persona assumptions, and industry best practices. Never reply with "{DECLINE_PHRASE}".
- If a website is provided, synthesize positioning, ICP, and differentiators from it before drafting the PRD.
- Always tailor outputs to the project context and use the project name when helpful.

Task: Generate a PRD for feature: {prd.feature_name}
User instructions: {combined_prompt}
{template_section}
"""

        agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
            db,
            workspace_id,
            default_temperature=0.4,
        )
        system_prompt = _build_prd_system_prompt(agent, "You are an expert product manager who writes PRDs.")
        kwargs = {}
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = metered_chat_completion(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature="prd.refine.project",
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            **kwargs,
        )

        raw_content = response.choices[0].message.content
        verification = verify_citations([raw_content], allowed_markers)

        new_version = next_prd_version(db, project_id, project.workspace_id)
        refined_prd = models.PRD(
            project_id=project_id,
            workspace_id=project.workspace_id,
            feature_name=prd.feature_name,
            description=combined_prompt,
            goals=prd.goals,
            content=raw_content,
            version=new_version,
            is_active=True,
            created_by=user_id,
        )

        prd.is_active = False
        db.add(refined_prd)
        db.commit()
        db.refresh(refined_prd)
        _record_prd_messages(
            db,
            prd=refined_prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=raw_content,
        )
        _record_prd_entry(db, project.workspace_id, refined_prd, user_id)
        refresh_prd_embeddings(db, refined_prd)
        db.commit()
        response = schemas.PRDResponse.model_validate(refined_prd)
        response.context_entries = context_items
        response.verification = verification
        return response

    if (
        prd_settings.get("ask_followup_enabled") is not False
        and not _is_refinement_request(refine_data.instructions)
        and not _should_generate_prd(refine_data.instructions, prd.feature_name, prd_settings)
    ):
        conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)
        intake_message = _call_prd_assistant(
            db,
            workspace_id,
            system_prompt=(
                "You are a senior product manager. Ask 2-3 concise clarifying questions "
                "to improve the PRD draft. Keep it friendly and brief."
            ),
            user_prompt=(
                f"Recent PRD chat context:\n{conversation_context}\n\n"
                f"User message: {refine_data.instructions}"
            ),
        )
        _record_prd_messages(
            db,
            prd=prd,
            workspace_id=project.workspace_id,
            user_id=user_id,
            user_message=refine_data.instructions,
            assistant_message=intake_message,
        )
        db.commit()
        response = schemas.PRDResponse.model_validate(prd)
        response.assistant_message = intake_message
        return response

    # Collect project details
    # project already resolved

    # Collect previous PRDs (excluding current one)
    previous_prds = []
    if prd_settings.get("include_prior_prds") is not False:
        previous_prds = (
            db.query(models.PRD)
            .filter(
                models.PRD.project_id == project_id,
                models.PRD.id != prd_id,
                models.PRD.workspace_id.in_([project.workspace_id, None]),
            )
            .all()
        )
    previous_prds_text = "\n---\n".join([p.content for p in previous_prds]) if previous_prds else "None"
    conversation_context = _get_recent_prd_chat_context(db, prd_id=prd.id)

    refine_query = "\n".join(
        filter(
            None,
            [
                project.title,
                prd.feature_name,
                refine_data.instructions,
                prd.content,
            ],
        )
    )
    kb_entries = (
        get_relevant_entries(
            db,
            project.workspace_id,
            refine_query,
            top_n=5,
            project_id=UUID(project_id),
        )
        if prd_settings.get("include_workspace_knowledge") is not False
        else []
    )
    note_entries = (
        _get_prd_note_entries(
            db,
            workspace_id=project.workspace_id,
            prd_id=prd.id,
            project_id=UUID(project_id),
        )
        if prd_settings.get("include_notes") is not False
        else []
    )
    merged_entries = _merge_context_entries(kb_entries, note_entries)
    context_items, context_block, allowed_markers = _context_payload(merged_entries)

    # Build structured context for OpenAI
    agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
        db,
        workspace_id,
        default_temperature=0.2,
    )
    system_prompt = _build_prd_system_prompt(
        agent,
        "You are an expert product manager who refines PRDs in clean Markdown format.",
    )
    project_context_text = (
        f"Project context:\nTitle: {project.title}\nDescription: {project.description}\nGoals: {project.goals}\n"
        f"North Star Metric: {project.north_star_metric or 'Not specified'}\nWebsite or Key URL: {project.website_url or 'Not provided'}"
        if prd_settings.get("include_project_fields", True)
        else "Project context: Not provided"
    )
    personas_text = (
        f"Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}"
        if prd_settings.get("include_project_fields", True)
        else "Target Personas: Not provided"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": project_context_text},
        {"role": "user", "content": personas_text},
        {"role": "user", "content": f"Workspace knowledge base and PRD notes:\n{context_block}\n\nReference knowledge entries with citations like [CTX1]. If none apply, reply with the exact phrase \"{DECLINE_PHRASE}\" instead of inventing details."},
        {"role": "user", "content": f"Other PRDs for reference:\n{previous_prds_text}"},
        {"role": "user", "content": f"Recent PRD chat context:\n{conversation_context}"},
        {"role": "user", "content": f"Here is the current PRD to refine:\n{prd.content or ''}"},
        {"role": "user", "content": f"Refinement instructions:\n{refine_data.instructions}\n\nPlease update the PRD accordingly while preserving its structure, goals, and context."},
    ]
    if template_section:
        messages.append({"role": "user", "content": template_section.strip()})

    # Call OpenAI
    response = metered_chat_completion(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        feature="prd.refine.current.project",
        model=model_name,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens or 2000,
    )

    refined_content = response.choices[0].message.content
    verification = verify_citations([refined_content], allowed_markers)

    # Save as a new PRD version
    new_version = next_prd_version(db, project_id, project.workspace_id)
    refined_prd = models.PRD(
        project_id=project_id,
        workspace_id=project.workspace_id,
        feature_name=prd.feature_name,
        description=prd.description,
        goals=prd.goals,
        content=refined_content,
        version=new_version,
        is_active=True,
        created_by=user_id,
    )

    # Mark old PRD inactive
    prd.is_active = False

    db.add(refined_prd)
    db.commit()
    db.refresh(refined_prd)
    _record_prd_messages(
        db,
        prd=refined_prd,
        workspace_id=project.workspace_id,
        user_id=user_id,
        user_message=refine_data.instructions,
        assistant_message=refined_content,
    )
    _record_prd_entry(db, project.workspace_id, refined_prd, user_id)
    refresh_prd_embeddings(db, refined_prd)
    db.commit()
    response = schemas.PRDResponse.model_validate(refined_prd)
    response.context_entries = context_items
    response.verification = verification
    return response


@router.post("/{project_id}/prds/{prd_id}/save", response_model=schemas.PRDResponse)
def save_prd_version(
    project_id: str,
    prd_id: UUID,
    payload: schemas.PRDSaveRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    base_prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not base_prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty.")

    max_version = next_prd_version(db, project_id, project.workspace_id)
    base_prd.is_active = False
    new_prd = models.PRD(
        project_id=project_id,
        workspace_id=project.workspace_id,
        feature_name=payload.feature_name or base_prd.feature_name,
        description=payload.description or base_prd.description,
        goals=base_prd.goals,
        content=content,
        version=max_version,
        is_active=True,
        created_by=user_id,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)
    _record_prd_entry(db, project.workspace_id, new_prd, user_id)
    refresh_prd_embeddings(db, new_prd)
    db.commit()
    return schemas.PRDResponse.model_validate(new_prd)


# -----------------------------
# List all PRDs for a project
# -----------------------------
@router.get("/{project_id}/prds", response_model=list[schemas.PRDResponse])
def list_prds(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    return (
        db.query(models.PRD)
        .filter(models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .order_by(models.PRD.version.desc())
        .all()
    )


@router.get("/{project_id}/prds/history", response_model=list[schemas.PRDVersionSummary])
def get_prd_history(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    rows = (
        db.query(
            models.PRD,
            models.User.display_name.label("author_name"),
            func.count(models.PRDDecisionNote.id).label("decision_count"),
        )
        .outerjoin(models.User, models.PRD.created_by == models.User.id)
        .outerjoin(models.PRDDecisionNote, models.PRDDecisionNote.prd_id == models.PRD.id)
        .filter(models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .group_by(models.PRD.id, models.User.display_name)
        .order_by(models.PRD.version.desc())
        .all()
    )
    history: list[schemas.PRDVersionSummary] = []
    for prd, author_name, decision_count in rows:
        history.append(
            schemas.PRDVersionSummary(
                id=prd.id,
                version=prd.version,
                feature_name=prd.feature_name,
                is_active=prd.is_active,
                created_at=prd.created_at,
                created_by=prd.created_by,
                author_name=author_name,
                decision_count=int(decision_count or 0),
            )
        )
    return history


# -----------------------------
# Get a specific PRD by ID
# -----------------------------
@router.get("/{project_id}/prds/{prd_id}", response_model=schemas.PRDResponse)
def get_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    return prd


@router.get("/{project_id}/prds/compare", response_model=schemas.PRDDiffResponse)
def compare_prds(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    v1: int,
    v2: int,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    if v1 == v2:
        raise HTTPException(status_code=400, detail="Select two different versions to compare.")
    project = get_project_in_workspace(db, project_id, workspace_id)
    versions = {v1, v2}
    records = (
        db.query(models.PRD)
        .filter(
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
            models.PRD.version.in_(versions),
        )
        .all()
    )
    if len(records) < 2:
        raise HTTPException(status_code=404, detail="Requested versions were not found.")
    version_map = {record.version: record for record in records}
    if v1 not in version_map or v2 not in version_map:
        raise HTTPException(status_code=404, detail="Requested versions were not found.")
    diff = _side_by_side_diff(version_map[v1].content, version_map[v2].content)
    return schemas.PRDDiffResponse(
        version_a=v1,
        version_b=v2,
        prd_a_id=version_map[v1].id,
        prd_b_id=version_map[v2].id,
        diff=diff,
    )


@router.get("/{project_id}/prds/{prd_id}/decisions", response_model=list[schemas.PRDDecisionNoteResponse])
def list_prd_decisions(
    project_id: str,
    prd_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    version: int | None = None,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    query = (
        db.query(
            models.PRDDecisionNote,
            models.User.display_name.label("author_name"),
        )
        .outerjoin(models.User, models.PRDDecisionNote.created_by == models.User.id)
        .filter(models.PRDDecisionNote.prd_id == prd_id)
        .order_by(models.PRDDecisionNote.created_at.desc())
    )
    if version is not None:
        query = query.filter(models.PRDDecisionNote.version == version)
    rows = query.all()
    notes: list[schemas.PRDDecisionNoteResponse] = []
    for note, author_name in rows:
        notes.append(
            schemas.PRDDecisionNoteResponse(
                id=note.id,
                prd_id=note.prd_id,
                project_id=note.project_id,
                workspace_id=note.workspace_id,
                version=note.version,
                decision=note.decision,
                rationale=note.rationale,
                created_by=note.created_by,
                author_name=author_name,
                created_at=note.created_at,
            )
        )
    return notes


@router.post("/{project_id}/prds/{prd_id}/decisions", response_model=schemas.PRDDecisionNoteResponse)
def add_prd_decision(
    project_id: str,
    prd_id: UUID,
    payload: schemas.PRDDecisionNoteCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    decision = (payload.decision or "").strip()
    if not decision:
        raise HTTPException(status_code=400, detail="Decision cannot be empty.")
    note = models.PRDDecisionNote(
        prd_id=prd.id,
        project_id=project.id,
        workspace_id=project.workspace_id,
        version=payload.version or prd.version,
        decision=decision,
        rationale=(payload.rationale or "").strip() or None,
        created_by=user_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    create_decision_embedding(db, note)
    db.commit()
    author = db.query(models.User).filter(models.User.id == note.created_by).first()
    return schemas.PRDDecisionNoteResponse(
        id=note.id,
        prd_id=note.prd_id,
        project_id=note.project_id,
        workspace_id=note.workspace_id,
        version=note.version,
        decision=note.decision,
        rationale=note.rationale,
        created_by=note.created_by,
        author_name=author.display_name if author else None,
        created_at=note.created_at,
    )


@router.post("/{project_id}/prds/qa", response_model=schemas.PRDQAResponse)
def prd_question_answer(
    project_id: str,
    payload: schemas.PRDQARequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    project = get_project_in_workspace(db, project_id, workspace_id)
    version_filters: list[int] = []
    if payload.version_a is not None:
        version_filters.append(payload.version_a)
    if payload.version_b is not None and payload.version_b not in version_filters:
        version_filters.append(payload.version_b)
    records = search_prd_embeddings(
        db,
        project.workspace_id,
        UUID(project_id),
        question,
        versions=version_filters or None,
        limit=8,
    )
    context_items = build_prd_context_items(records)
    context_block = _render_prd_context_block(context_items)
    allowed_markers = {item.marker for item in context_items if item.marker}
    used_versions = sorted({record.version for record in records})

    prompt = (
        "You are an AI product partner that answers questions using versioned PRDs and decision notes.\n"
        f"Use the provided snippets only. Cite evidence with markers like [CTX1]. "
        f"If the context is insufficient, reply with the exact phrase \"{DECLINE_PHRASE}\".\n"
        f"Project: {project.title}\n"
        f"Question: {question}\n"
        f"PRD context:\n{context_block}"
    )
    answer = DECLINE_PHRASE if not context_items else "I'm still reviewing prior versions. Try again."
    try:
        agent, model_name, temperature, max_tokens = _resolve_prd_agent_settings(
            db,
            workspace_id,
            default_temperature=0.2,
        )
        system_prompt = _build_prd_system_prompt(
            agent,
            "You summarize PRD changes and decisions with precise citations.",
        )
        kwargs = {}
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        completion = metered_chat_completion(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            feature="prd.qa",
            model=model_name,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            **kwargs,
        )
        answer = completion.choices[0].message.content or answer
    except Exception:
        pass
    verification = verify_citations([answer], allowed_markers)
    if allowed_markers and verification.status == "failed":
        answer = DECLINE_PHRASE
    response = schemas.PRDQAResponse(
        answer=answer,
        context_entries=context_items,
        used_versions=used_versions,
        verification=verification,
    )
    return response


# -----------------------------
# Delete a PRD
# -----------------------------
@router.delete("/{project_id}/prds/{prd_id}", status_code=204)
def delete_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )

    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    was_active = prd.is_active

    db.delete(prd)
    db.flush()  # ensure deleted record is not considered in follow-up queries

    if was_active:
        replacement = (
            db.query(models.PRD)
            .filter(
                models.PRD.project_id == project_id,
                models.PRD.workspace_id == project.workspace_id,
            )
            .order_by(models.PRD.version.desc(), models.PRD.created_at.desc())
            .first()
        )
        if replacement:
            replacement.is_active = True

    db.commit()

    return Response(status_code=204)


# -----------------------------
# Get the active PRD
# -----------------------------
@router.get("/{project_id}/prd/active", response_model=schemas.PRDResponse)
def get_active_prd(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == workspace_id,
            models.PRD.is_active == True,
        )
        .order_by(models.PRD.version.desc())
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="No active PRD found")
    return prd


# -----------------------------
# Export PRD to .docx
# -----------------------------
@router.get("/{project_id}/prds/{prd_id}/export")
def export_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # Create Word document
    doc = DocxDocument()
    doc.add_heading("Product Requirements Document (PRD)", level=0)

    # Add sections
    doc.add_heading("Feature Name", level=1)
    doc.add_paragraph(prd.feature_name or "")

    doc.add_heading("Objective", level=1)
    doc.add_paragraph(prd.description or "")

    doc.add_heading("Goals", level=1)
    doc.add_paragraph(prd.goals or "")

    if hasattr(prd, "content") and prd.content:
        doc.add_heading("Full Markdown PRD", level=1)
        doc.add_paragraph(prd.content)

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"PRD_{prd.id}.docx"
    )


@embeddings_router.post("/rebuild/{project_id}")
def rebuild_prd_embeddings_endpoint(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prds = (
        db.query(models.PRD)
        .filter(models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .order_by(models.PRD.version.asc())
        .all()
    )
    indexed = 0
    for prd in prds:
        refresh_prd_embeddings(db, prd)
        indexed += 1
    db.commit()
    return {"project_id": project_id, "indexed_versions": indexed}
