from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.knowledge_base_service import EMBED_TEXT_LIMIT
from backend.knowledge.embeddings import generate_embedding
from backend.rbac import ensure_membership

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/memory", tags=["workspace-memory"])


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.10f}" for value in values) + "]"


def remember_workspace_event(
    db: Session,
    workspace_id: UUID,
    *,
    content: str,
    source: str = "manual",
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    user_id: UUID | None = None,
    importance: float | None = None,
) -> models.WorkspaceMemory | None:
    text = (content or "").strip()
    if not text:
        return None
    clipped = text[:EMBED_TEXT_LIMIT]
    embedding = None
    try:
        embedding = generate_embedding(clipped, db=db, workspace_id=workspace_id)
    except Exception as exc:  # pragma: no cover - OpenAI dependency
        logger.warning("Failed to embed workspace memory for %s: %s", workspace_id, exc)
    memory = models.WorkspaceMemory(
        workspace_id=workspace_id,
        content=text,
        source=source or "manual",
        context_metadata=metadata or None,
        tags=tags or [],
        importance=importance,
        created_by=user_id,
        embedding=embedding,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


@router.get("", response_model=list[schemas.WorkspaceMemory])
def list_workspace_memory(
    workspace_id: UUID,
    user_id: UUID,
    query: str | None = Query(default=None, description="Full-text query for semantic search"),
    limit: int = Query(default=25, le=200),
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    base_query = db.query(models.WorkspaceMemory).filter(models.WorkspaceMemory.workspace_id == workspace_id)

    if query:
        normalized = query.strip()
        if not normalized:
            memories = (
                base_query.order_by(models.WorkspaceMemory.pinned.desc(), models.WorkspaceMemory.created_at.desc())
                .limit(limit)
                .all()
            )
        else:
            try:
                embedding = generate_embedding(normalized[:EMBED_TEXT_LIMIT], db=db, workspace_id=workspace_id)
                vector = _vector_literal(embedding)
                rows = db.execute(
                    sa.text(
                        "SELECT id FROM workspace_memories "
                        "WHERE workspace_id = :workspace AND embedding IS NOT NULL "
                        "ORDER BY embedding <-> (:vector)::vector LIMIT :limit"
                    ),
                    {"workspace": str(workspace_id), "vector": vector, "limit": limit},
                ).fetchall()
                if not rows:
                    memories = (
                        base_query.order_by(
                            models.WorkspaceMemory.pinned.desc(),
                            models.WorkspaceMemory.created_at.desc(),
                        )
                        .limit(limit)
                        .all()
                    )
                else:
                    ids = [row[0] for row in rows]
                    fetched = (
                        db.query(models.WorkspaceMemory)
                        .filter(models.WorkspaceMemory.id.in_(ids))
                        .all()
                    )
                    memory_map = {str(item.id): item for item in fetched}
                    memories = [memory_map[str(mem_id)] for mem_id in ids if str(mem_id) in memory_map]
            except Exception as exc:  # pragma: no cover - OpenAI dependency
                logger.warning("Failed to vector search workspace %s: %s", workspace_id, exc)
                memories = (
                    base_query.order_by(models.WorkspaceMemory.created_at.desc())
                    .limit(limit)
                    .all()
                )
    else:
        memories = (
            base_query.order_by(models.WorkspaceMemory.pinned.desc(), models.WorkspaceMemory.created_at.desc())
            .limit(limit)
            .all()
        )

    return [schemas.WorkspaceMemory.model_validate(item) for item in memories]


@router.post("", response_model=schemas.WorkspaceMemory)
def create_workspace_memory(
    workspace_id: UUID,
    payload: schemas.WorkspaceMemoryCreate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    memory = remember_workspace_event(
        db,
        workspace_id,
        content=payload.content,
        source=payload.source or "manual",
        metadata=payload.metadata,
        tags=payload.tags,
        user_id=user_id,
        importance=payload.importance,
    )
    if not memory:
        raise HTTPException(status_code=400, detail="Unable to create workspace memory.")
    return schemas.WorkspaceMemory.model_validate(memory)


@router.patch("/{memory_id}", response_model=schemas.WorkspaceMemory)
def update_workspace_memory(
    workspace_id: UUID,
    memory_id: UUID,
    payload: schemas.WorkspaceMemoryUpdate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    memory = (
        db.query(models.WorkspaceMemory)
        .filter(models.WorkspaceMemory.id == memory_id, models.WorkspaceMemory.workspace_id == workspace_id)
        .first()
    )
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found.")
    if payload.pinned is not None:
        memory.pinned = payload.pinned
    if payload.tags is not None:
        memory.tags = payload.tags
    if payload.importance is not None:
        memory.importance = payload.importance
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return schemas.WorkspaceMemory.model_validate(memory)
