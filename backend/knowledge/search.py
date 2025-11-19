from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from uuid import UUID

from backend.knowledge.embeddings import generate_embedding
from backend.workspaces import get_project_in_workspace
from backend.rbac import ensure_membership

router = APIRouter(
    prefix="/search",
    tags=["search"]
)

@router.get("/{project_id}")
def search_documents(project_id: str, query: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    query_embedding = generate_embedding(query)

    # Raw SQL for vector similarity
    result = db.execute("""
        SELECT id, filename, content, uploaded_at
        FROM documents
        WHERE project_id = :project_id AND (workspace_id = :workspace_id OR workspace_id IS NULL)
        ORDER BY embedding <-> :query_embedding
        LIMIT 5
    """, {"project_id": project_id, "workspace_id": str(project.workspace_id), "query_embedding": query_embedding}).fetchall()

    return [dict(row) for row in result]
