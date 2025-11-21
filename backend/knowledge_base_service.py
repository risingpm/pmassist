from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from backend import models

KB_ENTRY_TYPES = {"document", "prd", "insight", "research", "repo", "ai_output"}
UPLOAD_ROOT = Path("backend/static/kb_uploads")


def ensure_workspace_kb(db: Session, workspace_id: UUID) -> models.KnowledgeBase:
    kb = (
        db.query(models.KnowledgeBase)
        .filter(models.KnowledgeBase.workspace_id == workspace_id)
        .first()
    )
    if kb:
        return kb
    kb = models.KnowledgeBase(workspace_id=workspace_id)
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


def build_entry_content(entry: models.KnowledgeBaseEntry, clip: int | None = None) -> str:
    base = entry.content or ""
    if entry.type in {"document", "repo"}:
        chunks = sorted(
            entry.documents,
            key=lambda doc: int(doc.chunk_index) if str(doc.chunk_index).isdigit() else 0,
        )
        chunk_text = "\n".join(doc.content for doc in chunks)
        base = chunk_text or base
    if not base:
        return ""
    if clip and len(base) > clip:
        return base[:clip] + "..."
    return base


def get_kb_context_entries(db: Session, workspace_id: UUID, limit: int = 5) -> list[models.KnowledgeBaseEntry]:
    kb = ensure_workspace_kb(db, workspace_id)
    # Prioritize document/repo entries, then others by recency
    entries = (
        db.query(models.KnowledgeBaseEntry)
        .filter(models.KnowledgeBaseEntry.kb_id == kb.id)
        .order_by(models.KnowledgeBaseEntry.type.in_(["document", "repo"]).desc(), models.KnowledgeBaseEntry.created_at.desc())
        .limit(limit)
        .all()
    )
    return entries


def store_uploaded_file(workspace_id: UUID, filename: str, data: bytes) -> str:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    workspace_dir = UPLOAD_ROOT / str(workspace_id)
    workspace_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{filename}"
    path = workspace_dir / safe_name
    path.write_bytes(data)
    return str(path)


def delete_uploaded_file(path: str | None) -> None:
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass
