from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy.orm import Session
from uuid import UUID
import json
from .database import get_db
from . import models, schemas
from .workspaces import get_project_in_workspace
from backend.rbac import ensure_project_access
from backend.knowledge_base_service import ensure_workspace_kb, get_relevant_entries, build_entry_content
from backend.ai_providers import get_openai_client

from fastapi.responses import FileResponse
from docx import Document as DocxDocument
import tempfile
from dotenv import load_dotenv

# 🔑 Load environment variables
load_dotenv()

router = APIRouter(
    prefix="/projects",
    tags=["prds"]
)


def _context_items(entries: list[models.KnowledgeBaseEntry]) -> list[schemas.KnowledgeBaseContextItem]:
    items: list[schemas.KnowledgeBaseContextItem] = []
    for entry in entries:
        snippet = build_entry_content(entry, clip=800)
        if not snippet:
            snippet = entry.content or ""
        items.append(
            schemas.KnowledgeBaseContextItem(
                id=entry.id,
                title=entry.title,
                type=entry.type,
                snippet=snippet or "",
            )
        )
    return items


def _record_prd_entry(db: Session, workspace_id: UUID | None, prd: models.PRD, user_id: UUID | None) -> None:
    if not workspace_id:
        return
    kb = ensure_workspace_kb(db, workspace_id)
    entry = models.KnowledgeBaseEntry(
        kb_id=kb.id,
        type="prd",
        title=prd.feature_name or prd.project.title if prd.project else "PRD",
        content=prd.content,
        created_by=user_id,
        project_id=prd.project_id,
        tags=["prd"],
    )
    db.add(entry)
    db.commit()

# -----------------------------
# Generate a new PRD (Markdown only)
# -----------------------------
@router.post("/{project_id}/prd", response_model=schemas.PRDResponse)
def generate_prd(
    project_id: str,
    prd_data: schemas.PRDCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    context_query = "\n".join(
        filter(
            None,
            [
                project.title,
                project.description,
                project.goals,
                project.north_star_metric,
                prd_data.feature_name,
                prd_data.prompt,
            ],
        )
    )
    kb_entries = get_relevant_entries(db, project.workspace_id, context_query, top_n=5)
    context_items = _context_items(kb_entries)
    context_block = "\n\n".join(
        f"{item.title} ({item.type})\n{item.snippet}" for item in context_items
    )
    if not context_block:
        context_block = "No workspace knowledge-base entries yet."

    # build prompt
    prompt = f"""
Generate a Product Requirements Document (PRD) in **Markdown** format.

Always use Markdown headers, lists, and bullet points.
Include these sections:
- Objective
- Scope
- Success Metrics
- Engineering Requirements
- Future Work

Project Title: {project.title}
Description: {project.description}
Goals: {project.goals}
North Star Metric: {project.north_star_metric or 'Not specified'}
Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}

Workspace Knowledge Base:
{context_block}

Task: Generate a PRD for feature: {prd_data.feature_name}
User instructions: {prd_data.prompt}
"""

    client = get_openai_client(db, workspace_id)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert product manager who writes PRDs."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    # ✅ FIX: use .content instead of ["content"]
    raw_content = response.choices[0].message.content

    new_prd = models.PRD(
        project_id=project_id,
        workspace_id=project.workspace_id,
        feature_name=prd_data.feature_name,
        description=prd_data.prompt,
        goals=project.goals,
        content=raw_content,
        version=1,
        is_active=True,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)

    _record_prd_entry(db, project.workspace_id, new_prd, user_id)

    response = schemas.PRDResponse.model_validate(new_prd)
    response.context_entries = context_items
    return response


# ---------------------------------------------------------
# ✅ Refine an existing PRD
# ---------------------------------------------------------
@router.put("/{project_id}/prds/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd(
    project_id: str,
    prd_id: UUID,
    refine_data: schemas.PRDRefine,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    # Fetch the current PRD
    project = get_project_in_workspace(db, project_id, workspace_id)

    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # Collect project details
    # project already resolved

    # Collect previous PRDs (excluding current one)
    previous_prds = (
        db.query(models.PRD)
        .filter(
            models.PRD.project_id == project_id,
            models.PRD.id != prd_id,
            models.PRD.workspace_id.in_([project.workspace_id, None]),
        )
        .all()
    )
    previous_prds_text = "\n---\n".join([p.content for p in previous_prds]) if previous_prds else "None"

    refine_query = "\n".join(
        filter(
            None,
            [
                project.title,
                prd.feature_name,
                refine_data.instructions,
                prd.content,
            ],
        )
    )
    kb_entries = get_relevant_entries(db, project.workspace_id, refine_query, top_n=5)
    context_items = _context_items(kb_entries)
    context_block = "\n\n".join(
        f"{item.title} ({item.type})\n{item.snippet}" for item in context_items
    )
    if not context_block:
        context_block = "No workspace context available"

    # Build structured context for OpenAI
    messages = [
        {"role": "system", "content": "You are an expert product manager who refines PRDs in clean Markdown format."},
        {"role": "user", "content": f"Project context:\nTitle: {project.title}\nDescription: {project.description}\nGoals: {project.goals}\nNorth Star Metric: {project.north_star_metric or 'Not specified'}"},
        {"role": "user", "content": f"Target Personas: {', '.join(project.target_personas or []) or 'Not specified'}"},
        {"role": "user", "content": f"Workspace knowledge base:\n{context_block}"},
        {"role": "user", "content": f"Other PRDs for reference:\n{previous_prds_text}"},
        {"role": "user", "content": f"Here is the current PRD to refine:\n{prd.content or ''}"},
        {"role": "user", "content": f"Refinement instructions:\n{refine_data.instructions}\n\nPlease update the PRD accordingly while preserving its structure, goals, and context."},
    ]

    # Call OpenAI
    client = get_openai_client(db, workspace_id)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        temperature=0.2,
        max_tokens=2000,
    )

    refined_content = response.choices[0].message.content

    # Save as a new PRD version
    new_version = prd.version + 1
    refined_prd = models.PRD(
        project_id=project_id,
        workspace_id=project.workspace_id,
        feature_name=prd.feature_name,
        description=prd.description,
        goals=prd.goals,
        content=refined_content,
        version=new_version,
        is_active=True,
    )

    # Mark old PRD inactive
    prd.is_active = False

    db.add(refined_prd)
    db.commit()
    db.refresh(refined_prd)
    _record_prd_entry(db, project.workspace_id, refined_prd, user_id)
    response = schemas.PRDResponse.model_validate(refined_prd)
    response.context_entries = context_items
    return response


# -----------------------------
# List all PRDs for a project
# -----------------------------
@router.get("/{project_id}/prds", response_model=list[schemas.PRDResponse])
def list_prds(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    return (
        db.query(models.PRD)
        .filter(models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .all()
    )


# -----------------------------
# Get a specific PRD by ID
# -----------------------------
@router.get("/{project_id}/prds/{prd_id}", response_model=schemas.PRDResponse)
def get_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.id == prd_id, models.PRD.project_id == project_id, models.PRD.workspace_id == project.workspace_id)
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    return prd


# -----------------------------
# Delete a PRD
# -----------------------------
@router.delete("/{project_id}/prds/{prd_id}", status_code=204)
def delete_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = get_project_in_workspace(db, project_id, workspace_id)
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == project.workspace_id,
        )
        .first()
    )

    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    was_active = prd.is_active

    db.delete(prd)
    db.flush()  # ensure deleted record is not considered in follow-up queries

    if was_active:
        replacement = (
            db.query(models.PRD)
            .filter(models.PRD.project_id == project_id)
            .order_by(models.PRD.version.desc(), models.PRD.created_at.desc())
            .first()
        )
        if replacement:
            replacement.is_active = True

    db.commit()

    return Response(status_code=204)


# -----------------------------
# Get the active PRD
# -----------------------------
@router.get("/{project_id}/prd/active", response_model=schemas.PRDResponse)
def get_active_prd(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == workspace_id,
            models.PRD.is_active == True,
        )
        .order_by(models.PRD.version.desc())
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="No active PRD found")
    return prd


# -----------------------------
# Export PRD to .docx
# -----------------------------
@router.get("/{project_id}/prds/{prd_id}/export")
def export_prd(project_id: str, prd_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    prd = (
        db.query(models.PRD)
        .filter(
            models.PRD.id == prd_id,
            models.PRD.project_id == project_id,
            models.PRD.workspace_id == workspace_id,
        )
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # Create Word document
    doc = DocxDocument()
    doc.add_heading("Product Requirements Document (PRD)", level=0)

    # Add sections
    doc.add_heading("Feature Name", level=1)
    doc.add_paragraph(prd.feature_name or "")

    doc.add_heading("Objective", level=1)
    doc.add_paragraph(prd.description or "")

    doc.add_heading("Goals", level=1)
    doc.add_paragraph(prd.goals or "")

    if hasattr(prd, "content") and prd.content:
        doc.add_heading("Full Markdown PRD", level=1)
        doc.add_paragraph(prd.content)

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"PRD_{prd.id}.docx"
    )
