from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Document
from backend.knowledge.embeddings import generate_embedding

router = APIRouter(
    prefix="/search",
    tags=["search"]
)

@router.get("/{project_id}")
def search_documents(project_id: str, query: str, db: Session = Depends(get_db)):
    query_embedding = generate_embedding(query)

    # Raw SQL for vector similarity
    result = db.execute("""
        SELECT id, filename, content, uploaded_at
        FROM documents
        WHERE project_id = :project_id
        ORDER BY embedding <-> :query_embedding
        LIMIT 5
    """, {"project_id": project_id, "query_embedding": query_embedding}).fetchall()

    return [dict(row) for row in result]
