from __future__ import annotations

import os
import uuid
from pathlib import Path
from uuid import UUID
import logging

import sqlalchemy as sa
from sqlalchemy.orm import Session, joinedload

from backend import models
from backend.knowledge.embeddings import generate_embedding

logger = logging.getLogger(__name__)

KB_ENTRY_TYPES = {"document", "prd", "insight", "research", "repo", "ai_output", "roadmap"}
UPLOAD_ROOT = Path("backend/static/kb_uploads")
EMBED_TEXT_LIMIT = 8000


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


def _entry_text_source(entry: models.KnowledgeBaseEntry, text_override: str | None = None) -> str:
    text = (text_override or entry.content or "").strip()
    if text:
        return text
    if entry.documents:
        chunks = sorted(
            entry.documents,
            key=lambda doc: int(doc.chunk_index) if str(doc.chunk_index).isdigit() else 0,
        )
        doc_text = " ".join(doc.content for doc in chunks if doc.content)
        if doc_text:
            return doc_text
    return entry.title or ""


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


def update_entry_embedding(
    db: Session,
    entry: models.KnowledgeBaseEntry,
    *,
    text_override: str | None = None,
) -> None:
    text = _entry_text_source(entry, text_override)
    if not text:
        entry.embedding = None
        return
    clipped = text[:EMBED_TEXT_LIMIT]
    try:
        embedding = generate_embedding(clipped)
    except Exception as exc:  # pragma: no cover - relies on OpenAI
        logger.warning("Failed to generate embedding for KB entry %s: %s", entry.id, exc)
        return
    entry.embedding = embedding
    db.add(entry)


def get_relevant_entries(db: Session, workspace_id: UUID, query: str, top_n: int = 5) -> list[models.KnowledgeBaseEntry]:
    kb = ensure_workspace_kb(db, workspace_id)
    normalized_query = (query or "").strip()
    if not normalized_query:
        return get_kb_context_entries(db, workspace_id, limit=top_n)

    try:
        query_embedding = generate_embedding(normalized_query[:EMBED_TEXT_LIMIT])
    except Exception as exc:  # pragma: no cover - relies on OpenAI
        logger.warning("Falling back to recency context for workspace %s: %s", workspace_id, exc)
        return get_kb_context_entries(db, workspace_id, limit=top_n)

    vector_literal = "[" + ",".join(f"{value:.10f}" for value in query_embedding) + "]"
    rows = db.execute(
        sa.text(
            "SELECT id FROM kb_entries "
            "WHERE kb_id = :kb_id AND embedding IS NOT NULL "
            "ORDER BY embedding <-> (:embedding)::vector LIMIT :limit"
        ),
        {"kb_id": str(kb.id), "embedding": vector_literal, "limit": top_n},
    ).fetchall()

    if not rows:
        return get_kb_context_entries(db, workspace_id, limit=top_n)

    entry_ids = [row[0] for row in rows]
    entries = (
        db.query(models.KnowledgeBaseEntry)
        .options(joinedload(models.KnowledgeBaseEntry.documents))
        .filter(models.KnowledgeBaseEntry.id.in_(entry_ids))
        .all()
    )
    entry_map = {entry.id: entry for entry in entries}
    ordered: list[models.KnowledgeBaseEntry] = [entry_map[eid] for eid in entry_ids if eid in entry_map]

    if len(ordered) < top_n:
        seen = {entry.id for entry in ordered}
        fallback = get_kb_context_entries(db, workspace_id, limit=top_n)
        for entry in fallback:
            if entry.id not in seen:
                ordered.append(entry)
                seen.add(entry.id)
            if len(ordered) >= top_n:
                break

    return ordered


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
