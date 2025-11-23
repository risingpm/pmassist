from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from backend import models, schemas
from backend.database import get_db
from backend.knowledge.chunking import chunk_text
from backend.knowledge.file_utils import extract_text_from_file
from backend.knowledge_base_service import (
    KB_ENTRY_TYPES,
    build_entry_content,
    delete_uploaded_file,
    ensure_workspace_kb,
    store_uploaded_file,
    update_entry_embedding,
)
from backend.rbac import ensure_membership

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


def _serialize_entry(entry: models.KnowledgeBaseEntry) -> schemas.KnowledgeBaseEntryResponse:
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


def _normalize_tag_value(tag: str) -> str:
    return tag.strip().lower()


def _parse_tags(raw: Optional[str | list[str]]) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [_normalize_tag_value(tag) for tag in raw if tag and tag.strip()]
    return [_normalize_tag_value(tag) for tag in raw.split(",") if tag.strip()]


@router.get("/workspaces/{workspace_id}", response_model=schemas.KnowledgeBaseResponse)
def get_workspace_knowledge_base(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    kb = ensure_workspace_kb(db, workspace_id)
    return schemas.KnowledgeBaseResponse(
        id=kb.id,
        workspace_id=kb.workspace_id,
        name=kb.name,
        description=kb.description,
        created_at=kb.created_at,
    )


@router.get(
    "/workspaces/{workspace_id}/entries",
    response_model=list[schemas.KnowledgeBaseEntryResponse],
)
def list_kb_entries(
    workspace_id: UUID,
    user_id: UUID,
    entry_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    tag: Optional[str] = Query(None),
    project_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    kb = ensure_workspace_kb(db, workspace_id)
    query = (
        db.query(models.KnowledgeBaseEntry)
        .options(
            joinedload(models.KnowledgeBaseEntry.documents),
            joinedload(models.KnowledgeBaseEntry.creator),
        )
        .filter(models.KnowledgeBaseEntry.kb_id == kb.id)
        .order_by(models.KnowledgeBaseEntry.created_at.desc())
    )
    if entry_type:
        query = query.filter(models.KnowledgeBaseEntry.type == entry_type)
    if search:
        like_value = f"%{search.lower()}%"
        tag_string = sa.func.lower(
            sa.func.coalesce(sa.func.array_to_string(models.KnowledgeBaseEntry.tags, " "), "")
        )
        query = query.filter(
            sa.or_(
                sa.func.lower(models.KnowledgeBaseEntry.title).like(like_value),
                sa.func.lower(models.KnowledgeBaseEntry.content).like(like_value),
                tag_string.like(like_value),
            )
        )
    if tag:
        query = query.filter(models.KnowledgeBaseEntry.tags.contains([_normalize_tag_value(tag)]))
    if project_id:
        query = query.filter(models.KnowledgeBaseEntry.project_id == project_id)
    entries = query.limit(limit).all()
    return [_serialize_entry(entry) for entry in entries]


@router.post(
    "/workspaces/{workspace_id}/entries",
    response_model=schemas.KnowledgeBaseEntryResponse,
)
def create_text_entry(
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.KnowledgeBaseEntryCreate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    if payload.type not in KB_ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entry type")
    kb = ensure_workspace_kb(db, workspace_id)
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type=payload.type,
        title=payload.title.strip() or "Untitled",
        content=payload.content,
        source_url=payload.source_url,
        created_by=user_id,
        project_id=payload.project_id,
        tags=_parse_tags(payload.tags),
    )
    db.add(entry)
    db.flush()
    update_entry_embedding(db, entry, text_override=payload.content or entry.title)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)


@router.post(
    "/workspaces/{workspace_id}/entries/upload",
    response_model=schemas.KnowledgeBaseEntryResponse,
)
async def upload_kb_entry(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    entry_type: str = Form("document"),
    project_id: Optional[UUID] = Form(None),
    tags: Optional[str] = Form(None),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    normalized_type = entry_type or "document"
    if normalized_type not in KB_ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entry type")
    kb = ensure_workspace_kb(db, workspace_id)

    file_bytes = await file.read()
    try:
        extracted = extract_text_from_file(file.filename, file_bytes)
    except Exception as exc:  # pragma: no cover - passthrough from parser
        raise HTTPException(status_code=400, detail=f"Failed to read file: {exc}") from exc

    stored_path = store_uploaded_file(workspace_id, file.filename, file_bytes)
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type=normalized_type,
        title=(title or file.filename).strip() or file.filename,
        content=extracted[:10000],
        file_path=stored_path,
        created_by=user_id,
        project_id=project_id,
        tags=_parse_tags(tags),
    )
    db.add(entry)
    db.flush()

    # persist document chunks for embedding/search
    chunks = chunk_text(extracted)
    for idx, chunk in enumerate(chunks):
        doc = models.Document(
            project_id=project_id,
            filename=file.filename,
            chunk_index=str(idx),
            content=chunk,
            workspace_id=workspace_id,
            kb_entry_id=entry.id,
            uploaded_at=datetime.utcnow(),
        )
        db.add(doc)

    update_entry_embedding(db, entry, text_override=extracted)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)


@router.get("/entries/{entry_id}", response_model=schemas.KnowledgeBaseEntryResponse)
def get_entry(entry_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    entry = (
        db.query(models.KnowledgeBaseEntry)
        .join(models.KnowledgeBase)
        .filter(models.KnowledgeBase.workspace_id == workspace_id, models.KnowledgeBaseEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _serialize_entry(entry)


@router.patch("/entries/{entry_id}", response_model=schemas.KnowledgeBaseEntryResponse)
def update_entry(
    entry_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.KnowledgeBaseEntryUpdate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    entry = (
        db.query(models.KnowledgeBaseEntry)
        .join(models.KnowledgeBase)
        .filter(models.KnowledgeBase.workspace_id == workspace_id, models.KnowledgeBaseEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if payload.title is not None:
        entry.title = payload.title.strip() or entry.title
    if payload.content is not None:
        entry.content = payload.content
    if payload.source_url is not None:
        entry.source_url = payload.source_url
    if payload.tags is not None:
        entry.tags = _parse_tags(payload.tags)
    if payload.content is not None or payload.title is not None:
        update_entry_embedding(db, entry)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    entry = (
        db.query(models.KnowledgeBaseEntry)
        .join(models.KnowledgeBase)
        .options(joinedload(models.KnowledgeBaseEntry.documents))
        .filter(models.KnowledgeBase.workspace_id == workspace_id, models.KnowledgeBaseEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    delete_uploaded_file(entry.file_path)
    db.delete(entry)
    db.commit()


@router.get("/entries/{entry_id}/download")
def download_entry(entry_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    entry = (
        db.query(models.KnowledgeBaseEntry)
        .join(models.KnowledgeBase)
        .filter(models.KnowledgeBase.workspace_id == workspace_id, models.KnowledgeBaseEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.file_path and Path(entry.file_path).exists():
        return FileResponse(entry.file_path, filename=entry.title or "entry")
    content = build_entry_content(entry)
    if not content:
        raise HTTPException(status_code=404, detail="Entry has no content to download")
    return PlainTextResponse(content, headers={"Content-Disposition": f"attachment; filename={entry.title or 'entry'}.txt"})


@router.post("/{kb_id}/entries/{entry_id}/embed", response_model=schemas.KnowledgeBaseEntryResponse)
def embed_entry(
    kb_id: UUID,
    entry_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    kb = (
        db.query(models.KnowledgeBase)
        .filter(models.KnowledgeBase.id == kb_id)
        .first()
    )
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    ensure_membership(db, kb.workspace_id, user_id, required_role="editor")
    entry = (
        db.query(models.KnowledgeBaseEntry)
        .options(joinedload(models.KnowledgeBaseEntry.documents), joinedload(models.KnowledgeBaseEntry.creator))
        .filter(models.KnowledgeBaseEntry.id == entry_id, models.KnowledgeBaseEntry.kb_id == kb.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    update_entry_embedding(db, entry)
    db.commit()
    db.refresh(entry)
    return _serialize_entry(entry)
