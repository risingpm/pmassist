import os
from textwrap import dedent
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Project, Document, PRD, Roadmap, RoadmapConversation
from backend import schemas

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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
         "note_key": "<snake_case_key to store the user's answer>"
       }

    2. Present the roadmap:
       {
         "action": "present_roadmap",
         "message": "<short introduction>",
         "roadmap_markdown": "<markdown roadmap with headings for MVP, Phase 2, Phase 3>"
       }
    """
).strip()


def build_context_block(project: Project, docs: list[Document], prds: list[PRD]) -> str:
    lines = [
        f"Project Title: {project.title}",
        f"Description: {project.description}",
        f"Goals: {project.goals}",
        f"North Star Metric: {project.north_star_metric or 'Not specified'}",
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


def upsert_roadmap(db: Session, project_id: str, content: str) -> Roadmap:
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id == project_id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if roadmap:
        roadmap.content = content
        roadmap.is_active = True
    else:
        roadmap = Roadmap(id=uuid.uuid4(), project_id=project_id, content=content, is_active=True)
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
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    docs = db.query(Document).filter(Document.project_id == project_id).all()
    prds = db.query(PRD).filter(PRD.project_id == project_id).all()
    context_block = build_context_block(project, docs, prds)

    history_messages = payload.conversation_history or []
    prompt = (payload.prompt or "").strip()
    if not prompt and not history_messages:
        raise HTTPException(status_code=400, detail="Prompt is required to start the conversation.")

    effective_history = history_messages.copy()
    if prompt:
        effective_history.append(schemas.RoadmapChatMessage(role="user", content=prompt))

    openai_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Project context:\n{context_block}"},
    ]
    openai_messages.extend(
        {"role": msg.role, "content": msg.content} for msg in effective_history
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=openai_messages,
        temperature=0.2,
        response_format={"type": "json_object"},
    )

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
    if action == "present_roadmap":
        roadmap_markdown = data.get("roadmap_markdown", "").strip()
        if not roadmap_markdown:
            raise HTTPException(status_code=500, detail="Assistant did not include roadmap_markdown.")
        upsert_roadmap(db, project_id, roadmap_markdown)
    else:
        roadmap_markdown = None

    store_conversation(db, project_id, updated_history)

    return schemas.RoadmapGenerateResponse(
        message=assistant_message,
        conversation_history=updated_history,
        roadmap=roadmap_markdown,
    )


@router.get("/{project_id}/roadmap", response_model=schemas.RoadmapContentResponse)
def get_saved_roadmap(project_id: str, db: Session = Depends(get_db)):
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id == project_id, Roadmap.is_active == True)
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
def update_roadmap(project_id: str, payload: schemas.RoadmapUpdateRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    roadmap = upsert_roadmap(db, project_id, payload.content)
    return {
        "id": str(roadmap.id),
        "updated_at": (roadmap.updated_at or roadmap.created_at).isoformat(),
    }
