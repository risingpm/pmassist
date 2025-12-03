from __future__ import annotations

from typing import Iterable
from uuid import UUID
import uuid as uuid_pkg

import sqlalchemy as sa
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.knowledge.embeddings import generate_embedding
from backend.knowledge_base_service import EMBED_TEXT_LIMIT

PRD_EMBED_CHUNK_SIZE = 1200


def next_prd_version(db: Session, project_id: UUID | str, workspace_id: UUID | None) -> int:
    query = (
        db.query(func.max(models.PRD.version))
        .filter(models.PRD.project_id == project_id)
    )
    if workspace_id:
        query = query.filter(models.PRD.workspace_id == workspace_id)
    value = query.scalar()
    return int(value or 0) + 1


def _chunk_markdown(content: str | None, chunk_size: int = PRD_EMBED_CHUNK_SIZE) -> list[str]:
    if not content:
        return []
    lines = content.replace("\r\n", "\n").split("\n")
    buckets: list[str] = []
    buffer: list[str] = []
    length = 0
    for line in lines:
        buffer.append(line)
        length += len(line) + 1
        if length >= chunk_size:
            chunk = "\n".join(buffer).strip()
            if chunk:
                buckets.append(chunk)
            buffer = []
            length = 0
    if buffer:
        chunk = "\n".join(buffer).strip()
        if chunk:
            buckets.append(chunk)
    return buckets or [content.strip()]


def refresh_prd_embeddings(db: Session, prd: models.PRD) -> None:
    if not prd.workspace_id:
        return
    db.query(models.PRDEmbedding).filter(models.PRDEmbedding.prd_id == prd.id).delete()
    chunks = _chunk_markdown(prd.content)
    for index, chunk in enumerate(chunks):
        _store_embedding(
            db,
            prd=prd,
            chunk=chunk,
            chunk_index=index,
            chunk_type="body",
        )
    notes = (
        db.query(models.PRDDecisionNote)
        .filter(models.PRDDecisionNote.prd_id == prd.id)
        .all()
    )
    for note in notes:
        payload = f"Decision (v{note.version}): {note.decision}\nRationale: {note.rationale or 'Not provided'}"
        _store_embedding(
            db,
            prd=prd,
            chunk=payload,
            chunk_index=0,
            chunk_type="decision",
            decision_note_id=note.id,
        )


def _store_embedding(
    db: Session,
    *,
    prd: models.PRD,
    chunk: str,
    chunk_index: int,
    chunk_type: str,
    decision_note_id: UUID | None = None,
) -> None:
    try:
        embedding = generate_embedding(chunk[:EMBED_TEXT_LIMIT], db=db, workspace_id=prd.workspace_id)
    except Exception:
        return
    record = models.PRDEmbedding(
        prd_id=prd.id,
        project_id=prd.project_id,
        workspace_id=prd.workspace_id,
        version=prd.version,
        chunk_index=chunk_index,
        chunk_type=chunk_type,
        chunk=chunk,
        decision_note_id=decision_note_id,
        embedding=embedding,
    )
    db.add(record)


def create_decision_embedding(db: Session, note: models.PRDDecisionNote) -> None:
    prd = db.query(models.PRD).filter(models.PRD.id == note.prd_id).first()
    if not prd or not prd.workspace_id:
        return
    payload = f"Decision (v{note.version}): {note.decision}\nRationale: {note.rationale or 'Not provided'}"
    _store_embedding(
        db,
        prd=prd,
        chunk=payload,
        chunk_index=0,
        chunk_type="decision",
        decision_note_id=note.id,
    )


def search_prd_embeddings(
    db: Session,
    workspace_id: UUID,
    project_id: UUID | str | None,
    query: str,
    *,
    versions: Iterable[int] | None = None,
    limit: int = 6,
) -> list[models.PRDEmbedding]:
    normalized = (query or "").strip()
    if not normalized:
        return []
    try:
        query_embedding = generate_embedding(normalized[:EMBED_TEXT_LIMIT], db=db, workspace_id=workspace_id)
    except Exception:
        return []
    fetch_limit = max(limit * 3, limit + 2) if versions else limit
    vector_literal = "[" + ",".join(f"{value:.10f}" for value in query_embedding) + "]"
    base_sql = (
        "SELECT id FROM prd_embeddings "
        "WHERE workspace_id = :workspace_id "
        "AND embedding IS NOT NULL "
    )
    params: dict[str, str | int] = {
        "workspace_id": str(workspace_id),
        "embedding": vector_literal,
        "limit": fetch_limit,
    }
    if project_id:
        base_sql += "AND project_id = :project_id "
        params["project_id"] = str(project_id)
    base_sql += "ORDER BY embedding <-> (:embedding)::vector LIMIT :limit"
    rows = db.execute(sa.text(base_sql), params).fetchall()
    if not rows:
        return []
    ids = [str(row[0]) for row in rows]
    records = (
        db.query(models.PRDEmbedding)
        .filter(models.PRDEmbedding.id.in_(ids))
        .all()
    )
    record_map = {str(rec.id): rec for rec in records}
    ordered: list[models.PRDEmbedding] = [record_map[rec_id] for rec_id in ids if rec_id in record_map]
    if versions:
        version_set = {int(v) for v in versions}
        filtered = [rec for rec in ordered if rec.version in version_set]
        if filtered:
            return filtered[:limit]
    return ordered[:limit]


def build_prd_context_items(
    records: Iterable[models.PRDEmbedding],
    *,
    start_index: int = 1,
) -> list[schemas.KnowledgeBaseContextItem]:
    items: list[schemas.KnowledgeBaseContextItem] = []
    index = start_index
    for record in records:
        marker = f"CTX{index}"
        title = (
            f"PRD v{record.version} decision"
            if record.chunk_type == "decision"
            else f"PRD v{record.version}"
        )
        snippet = (record.chunk or "")[:240]
        items.append(
            schemas.KnowledgeBaseContextItem(
                id=uuid_pkg.uuid4(),
                title=title,
                type="prd",  # type: ignore[arg-type]
                snippet=snippet,
                marker=marker,
            )
        )
        index += 1
    return items
