import os
from textwrap import dedent
import json
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from openai import (
    OpenAI,
    APIConnectionError,
    APIError,
    APIStatusError,
    RateLimitError,
    AuthenticationError,
    BadRequestError,
)
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Project, Document, PRD, Roadmap, RoadmapConversation, UserAgent
from backend.workspaces import get_project_in_workspace
from backend import schemas
from backend.rbac import ensure_membership

_openai_kwargs = {"api_key": os.getenv("OPENAI_API_KEY")}
_openai_org = os.getenv("OPENAI_ORG")
if _openai_org:
    _openai_kwargs["organization"] = _openai_org
client = OpenAI(**_openai_kwargs)

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

SYSTEM_PROMPT = dedent(
    """
    You are an expert product strategy assistant. When helping a product manager craft a roadmap:
    - Ask focused product management questions to clarify vision, personas, desired outcomes, constraints, risks, and timelines if details are missing.
    - Once you have enough context, produce a comprehensive roadmap in Markdown with sections for MVP, Phase 2, and Phase 3.

    Respond exclusively in JSON following one of the shapes below:

    1. Ask for clarification:
       {
         "action": "ask_followup",
         "message": "<your question in natural language>",
         "note_key": "<snake_case_key to store the user's answer>",
         "suggestions": ["<optional quick reply 1>", "<optional quick reply 2>"]
       }

    2. Present the roadmap:
       {
         "action": "present_roadmap",
         "message": "<short introduction>",
         "roadmap_markdown": "<markdown roadmap with headings for MVP, Phase 2, Phase 3>",
         "suggestions": []
       }
    """
).strip()


def build_agent_prompt(agent: UserAgent | None) -> str | None:
    if not agent:
        return None

    focus = ", ".join(agent.focus_areas) if agent.focus_areas else "varied product workflows"
    personality = agent.personality or "product"
    name = agent.name or "Your AI PM"
    return (
        f"You are {name}, a {personality} AI Product Manager. You specialize in {focus} and assist your user across product workflows."
    )


def build_context_block(project: Project, docs: list[Document], prds: list[PRD]) -> str:
    lines = [
        f"Project Title: {project.title}",
        f"Description: {project.description}",
        f"Goals: {project.goals}",
        f"North Star Metric: {project.north_star_metric or 'Not specified'}",
        f"Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}",
        "",
        "Key Documents:",
    ]
    if docs:
        for doc in docs[:10]:
            preview = doc.content[:500]
            lines.append(f"- {doc.filename}: {preview}")
    else:
        lines.append("- None uploaded")

    if prds:
        lines.append("\nExisting PRDs:")
        for prd in prds[:5]:
            content_preview = (prd.content or "")[:800]
            lines.append(f"--- PRD ---\n{content_preview}")
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
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id == project.id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if roadmap:
        roadmap.content = content
        roadmap.is_active = True
        if not roadmap.workspace_id:
            roadmap.workspace_id = project.workspace_id
    else:
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


router = APIRouter(prefix="/projects", tags=["roadmap"])


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

    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")

    project = get_project_in_workspace(db, project_id, payload.workspace_id)

    docs = (
        db.query(Document)
        .filter(
            Document.project_id == project_id,
            Document.workspace_id.in_([project.workspace_id, None]),
        )
        .all()
    )
    prds = (
        db.query(PRD)
        .filter(
            PRD.project_id == project_id,
            PRD.workspace_id.in_([project.workspace_id, None]),
        )
        .all()
    )
    context_block = build_context_block(project, docs, prds)

    history_messages = payload.conversation_history or []
    prompt = (payload.prompt or "").strip()
    if not prompt and not history_messages:
        raise HTTPException(status_code=400, detail="Prompt is required to start the conversation.")

    effective_history = history_messages.copy()
    if prompt:
        effective_history.append(schemas.RoadmapChatMessage(role="user", content=prompt))

    agent_prompt = None
    if payload.user_id:
        agent = (
            db.query(UserAgent)
            .filter(UserAgent.user_id == payload.user_id)
            .first()
        )
        agent_prompt = build_agent_prompt(agent)

    system_message = SYSTEM_PROMPT if not agent_prompt else f"{agent_prompt}\n\n{SYSTEM_PROMPT}"

    openai_messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": f"Project context:\n{context_block}"},
    ]
    openai_messages.extend(
        {"role": msg.role, "content": msg.content} for msg in effective_history
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=openai_messages,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except RateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail="OpenAI rate limit reached. Please wait a moment and try again.",
        ) from exc
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=502,
            detail="OpenAI rejected the API key in use. Verify OPENAI_API_KEY is valid.",
        ) from exc
    except (APIConnectionError, APIStatusError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to reach OpenAI to generate the roadmap. Try again shortly.",
        ) from exc
    except (BadRequestError, APIError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI request failed: {getattr(exc, 'message', str(exc))}",
        ) from exc
    except Exception as exc:  # pragma: no cover - safety net for unexpected SDK errors
        raise HTTPException(
            status_code=500, detail=f"Unexpected error while contacting OpenAI: {exc}"
        ) from exc

    try:
        data = json.loads(response.choices[0].message.content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Assistant returned invalid JSON: {exc}")

    action = data.get("action")
    assistant_message = data.get("message", "")
    if action not in {"ask_followup", "present_roadmap"}:
        raise HTTPException(status_code=500, detail="Assistant returned an unknown action.")

    updated_history = effective_history + [
        schemas.RoadmapChatMessage(role="assistant", content=assistant_message)
    ]

    roadmap_markdown: str | None = None
    note_key = data.get("note_key")
    suggestions_raw = data.get("suggestions")
    suggestions: list[str] | None = None
    if isinstance(suggestions_raw, list):
        cleaned = [str(item) for item in suggestions_raw if isinstance(item, (str, int, float))]
        if cleaned:
            suggestions = cleaned[:4]
    if action == "present_roadmap":
        roadmap_markdown = data.get("roadmap_markdown", "").strip()
        if not roadmap_markdown:
            raise HTTPException(status_code=500, detail="Assistant did not include roadmap_markdown.")
        saved = upsert_roadmap(db, project, roadmap_markdown)
    else:
        roadmap_markdown = None
        if not suggestions:
            key = str(note_key or "").lower()
            defaults = DEFAULT_SUGGESTIONS.get(key)
            if defaults:
                suggestions = defaults[:3]
            else:
                suggestions = [
                    "Let me add more context...",
                    "Here are some constraints...",
                ]

    store_conversation(db, project_id, updated_history)

    return schemas.RoadmapGenerateResponse(
        message=assistant_message,
        conversation_history=updated_history,
        roadmap=roadmap_markdown,
        action=action,
        suggestions=suggestions,
    )


@router.get("/{project_id}/roadmap", response_model=schemas.RoadmapContentResponse)
def get_saved_roadmap(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
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


@router.put("/{project_id}/roadmap")
def update_roadmap(
    project_id: str,
    payload: schemas.RoadmapUpdateRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    roadmap = upsert_roadmap(db, project, payload.content)
    return {
        "id": str(roadmap.id),
        "updated_at": (roadmap.updated_at or roadmap.created_at).isoformat(),
    }
