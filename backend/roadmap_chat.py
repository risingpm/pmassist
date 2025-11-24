from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.knowledge import roadmap_ai
from backend.rbac import ensure_membership, ensure_project_access
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/chat", tags=["roadmap-chat"])


def _deserialize_messages(raw: list[dict[str, str]] | None) -> list[schemas.RoadmapChatMessage]:
    if not raw:
        return []
    messages: list[schemas.RoadmapChatMessage] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        content = entry.get("content")
        if isinstance(role, str) and isinstance(content, str):
            messages.append(schemas.RoadmapChatMessage(role=role, content=content))
    return messages


def _serialize_chat(chat: models.RoadmapChat) -> schemas.RoadmapChatRecord:
    return schemas.RoadmapChatRecord(
        id=chat.id,
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        user_id=chat.user_id,
        messages=_deserialize_messages(chat.messages),
        output_entry_id=chat.output_entry_id,
        created_at=chat.created_at,
    )


def _require_prompt(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Prompt is required.")
    return cleaned


def _process_chat_turn(
    db: Session,
    payload: schemas.RoadmapChatTurnRequest,
    chat: models.RoadmapChat | None,
) -> schemas.RoadmapChatResponse:
    prompt = _require_prompt(payload.prompt)
    if chat is None:
        chat = models.RoadmapChat(
            workspace_id=payload.workspace_id,
            project_id=payload.project_id,
            user_id=payload.user_id,
            messages=[],
        )
        db.add(chat)
        db.flush()
    existing_history = _deserialize_messages(chat.messages)

    request_payload = schemas.RoadmapGenerateRequest(
        prompt=prompt,
        conversation_history=existing_history,
        user_id=payload.user_id,
        workspace_id=payload.workspace_id,
    )
    response = roadmap_ai.generate_roadmap_endpoint(str(payload.project_id), request_payload, db=db)

    updated_messages = existing_history + [
        schemas.RoadmapChatMessage(role="user", content=prompt),
        schemas.RoadmapChatMessage(role="assistant", content=response.message),
    ]
    chat.messages = [message.model_dump() for message in updated_messages]
    if response.kb_entry_id:
        chat.output_entry_id = response.kb_entry_id
    chat.project_id = payload.project_id
    chat.workspace_id = payload.workspace_id
    db.add(chat)
    db.commit()
    db.refresh(chat)

    record = _serialize_chat(chat)
    return schemas.RoadmapChatResponse(
        **record.model_dump(),
        assistant_message=response.message,
        roadmap=response.roadmap,
        context_entries=response.context_entries,
        action=response.action,
        suggestions=response.suggestions,
        kb_entry_id=response.kb_entry_id or chat.output_entry_id,
    )


@router.post("/roadmap", response_model=schemas.RoadmapChatResponse)
def create_or_continue_chat(
    payload: schemas.RoadmapChatTurnRequest,
    db: Session = Depends(get_db),
):
    perm = ensure_project_access(
        db,
        payload.workspace_id,
        payload.project_id,
        payload.user_id,
        required_role="contributor",
    )
    if perm.workspace.role not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="You do not have permission to chat with the roadmap assistant.")

    project = get_project_in_workspace(db, str(payload.project_id), payload.workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    chat: models.RoadmapChat | None = None
    if payload.chat_id:
        chat = (
            db.query(models.RoadmapChat)
            .filter(
                models.RoadmapChat.id == payload.chat_id,
                models.RoadmapChat.workspace_id == payload.workspace_id,
            )
            .first()
        )
        if not chat:
            raise HTTPException(status_code=404, detail="Chat session not found.")
        if chat.project_id and chat.project_id != payload.project_id:
            raise HTTPException(status_code=400, detail="Chat session belongs to a different project.")

    return _process_chat_turn(db, payload, chat)


@router.put("/roadmap/{chat_id}", response_model=schemas.RoadmapChatResponse)
def refine_chat(
    chat_id: UUID,
    payload: schemas.RoadmapChatTurnRequest,
    db: Session = Depends(get_db),
):
    payload.chat_id = chat_id
    return create_or_continue_chat(payload, db=db)


@router.get("/roadmap/{chat_id}", response_model=schemas.RoadmapChatRecord)
def get_chat(chat_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    chat = (
        db.query(models.RoadmapChat)
        .filter(models.RoadmapChat.id == chat_id, models.RoadmapChat.workspace_id == workspace_id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return _serialize_chat(chat)
