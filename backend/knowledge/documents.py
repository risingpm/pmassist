from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Document
from backend.knowledge.file_utils import extract_text_from_file
from backend.knowledge.chunking import chunk_text
from backend.knowledge.embeddings import generate_embedding
import uuid
from datetime import datetime

router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)

# 📌 Upload a document to a project
@router.post("/{project_id}")
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        file_bytes = await file.read()
        text = extract_text_from_file(file.filename, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

    # Split into chunks
    chunks = chunk_text(text)

    new_docs = []
    for i, chunk in enumerate(chunks):
        new_doc = Document(
            id=uuid.uuid4(),
            project_id=project_id,
            filename=file.filename,
            chunk_index=i,
            content=chunk,
            embedding=None,  # embeddings optional
            uploaded_at=datetime.utcnow()
        )
        db.add(new_doc)
        new_docs.append(new_doc)

    db.commit()

    return {
        "project_id": project_id,
        "filename": file.filename,
        "chunks_stored": len(new_docs)
    }


# 📌 List all documents for a project
@router.get("/{project_id}")
def list_documents(project_id: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    return [
        {
            "id": str(d.id),
            "filename": d.filename,
            "chunk_index": d.chunk_index,
            "uploaded_at": d.uploaded_at,
            "has_embedding": d.embedding is not None
        }
        for d in docs
    ]


# 📌 Fetch full content of a single chunk
@router.get("/{project_id}/{doc_id}")
def get_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.project_id == project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "id": str(doc.id),
        "project_id": doc.project_id,
        "filename": doc.filename,
        "chunk_index": doc.chunk_index,
        "uploaded_at": doc.uploaded_at,
        "content": doc.content,
        "has_embedding": doc.embedding is not None
    }


# 📌 Delete a document chunk
@router.delete("/{project_id}/{doc_id}")
def delete_document(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = (
        db.query(Document)
        .filter(Document.id == doc_id, Document.project_id == project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete(doc)
    db.commit()
    return {"id": doc_id, "deleted": True}


# 📌 Generate embeddings for all docs of a project
@router.post("/embed/{project_id}")
def embed_documents(project_id: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(
        Document.project_id == project_id,
        Document.embedding == None  # only chunks without embeddings
    ).all()

    if not docs:
        return {"message": "No documents pending embedding."}

    for doc in docs:
        doc.embedding = generate_embedding(doc.content)
        db.add(doc)

    db.commit()

    return {
        "project_id": project_id,
        "embedded_chunks": len(docs)
    }
