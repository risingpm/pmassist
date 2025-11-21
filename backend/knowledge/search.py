from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
import sqlalchemy as sa

from backend.database import get_db
from backend.knowledge.embeddings import generate_embedding
from backend.knowledge_base_service import ensure_workspace_kb
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
    query_embedding = generate_embedding(query)

    params: dict[str, object] = {
        "kb_id": kb.id,
        "query_embedding": query_embedding,
        "limit": limit,
    }
    filters: list[str] = []
    if entry_type:
        filters.append("e.type = :entry_type")
        params["entry_type"] = entry_type
    if project_id:
        filters.append("e.project_id = :project_id")
        params["project_id"] = project_id

    sql = (
        "SELECT d.id, d.filename, d.content, d.uploaded_at, e.title, e.type, e.project_id "
        "FROM documents d "
        "JOIN kb_entries e ON d.kb_entry_id = e.id "
        "WHERE e.kb_id = :kb_id"
    )
    if filters:
        sql += " AND " + " AND ".join(filters)
    sql += " ORDER BY d.embedding <-> :query_embedding LIMIT :limit"

    rows = db.execute(sa.text(sql), params).fetchall()
    return [dict(row) for row in rows]
