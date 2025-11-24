from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
import sqlalchemy as sa

from backend.database import get_db
from backend import models
from backend.knowledge.embeddings import generate_embedding
from backend.knowledge_base_service import ensure_workspace_kb, build_entry_content, EMBED_TEXT_LIMIT
from backend.rbac import ensure_membership

router = APIRouter(prefix="/knowledge/search", tags=["knowledge-search"])


@router.get("/{workspace_id}")
def search_knowledge(
    workspace_id: UUID,
    query: str,
    user_id: UUID,
    entry_type: str | None = None,
    project_id: UUID | None = None,
    limit: int = 5,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    kb = ensure_workspace_kb(db, workspace_id)
    normalized_query = (query or "").strip()
    if not normalized_query:
        return []

    params: dict[str, object] = {
        "kb_id": str(kb.id),
        "limit": limit,
    }
    filters: list[str] = []
    if entry_type:
        filters.append("type = :entry_type")
        params["entry_type"] = entry_type
    if project_id:
        filters.append("project_id = :project_id")
        params["project_id"] = str(project_id)

    entry_ids: list[UUID] = []
    try:
        query_embedding = generate_embedding(normalized_query[:EMBED_TEXT_LIMIT])
        vector_literal = "[" + ",".join(f"{value:.10f}" for value in query_embedding) + "]"
        params["embedding"] = vector_literal
        sql = (
            "SELECT id FROM kb_entries "
            "WHERE kb_id = :kb_id AND embedding IS NOT NULL"
        )
        if filters:
            sql += " AND " + " AND ".join(filters)
        sql += " ORDER BY embedding <-> (:embedding)::vector LIMIT :limit"
        rows = db.execute(sa.text(sql), params).fetchall()
        entry_ids = [row[0] for row in rows]
    except Exception:
        entry_ids = []

    entries_query = (
        db.query(models.KnowledgeBaseEntry)
        .options(joinedload(models.KnowledgeBaseEntry.documents))
        .filter(models.KnowledgeBaseEntry.kb_id == kb.id)
    )
    if entry_type:
        entries_query = entries_query.filter(models.KnowledgeBaseEntry.type == entry_type)
    if project_id:
        entries_query = entries_query.filter(models.KnowledgeBaseEntry.project_id == project_id)

    entries: list[models.KnowledgeBaseEntry]
    if entry_ids:
        entries = entries_query.filter(models.KnowledgeBaseEntry.id.in_(entry_ids)).all()
        entry_map = {entry.id: entry for entry in entries}
        ordered = [entry_map[eid] for eid in entry_ids if eid in entry_map]
        entries = ordered
    else:
        like_value = f"%{normalized_query.lower()}%"
        entries = (
            entries_query.filter(
                sa.or_(
                    sa.func.lower(models.KnowledgeBaseEntry.title).like(like_value),
                    sa.func.lower(models.KnowledgeBaseEntry.content).like(like_value),
                )
            )
            .order_by(models.KnowledgeBaseEntry.created_at.desc())
            .limit(limit)
            .all()
        )

    results: list[dict[str, object]] = []
    for entry in entries:
        snippet = build_entry_content(entry, clip=600) or entry.content or ""
        results.append(
            {
                "id": entry.id,
                "title": entry.title,
                "type": entry.type,
                "content": snippet,
                "uploaded_at": entry.created_at,
                "project_id": entry.project_id,
                "tags": entry.tags or [],
            }
        )
    return results
