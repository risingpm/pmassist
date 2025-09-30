from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from uuid import UUID
import json
from .database import get_db
from . import models, schemas

from openai import OpenAI
import os
from fastapi.responses import FileResponse
from docx import Document as DocxDocument
import tempfile
from dotenv import load_dotenv

# 🌍 Load environment variables
load_dotenv()

# 🤖 OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(
    prefix="/projects",
    tags=["prds"]
)

# -----------------------------
# Generate a new PRD (Markdown only)
# -----------------------------
@router.post("/{project_id}/prd", response_model=schemas.PRDResponse)
def generate_prd(project_id: str, prd_data: schemas.PRDCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # collect context
    previous_prds = db.query(models.PRD).filter(models.PRD.project_id == project_id).all()
    previous_prds_text = "\n---\n".join([p.content for p in previous_prds]) if previous_prds else "None"

    docs = db.query(models.Document).filter(models.Document.project_id == project_id).all()
    docs_text = "\n---\n".join([d.content for d in docs]) if docs else "None"

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

Uploaded Documents:
{docs_text}

Previous PRDs:
{previous_prds_text}

Task: Generate a PRD for feature: {prd_data.feature_name}
User instructions: {prd_data.prompt}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an expert product manager who writes PRDs."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    raw_content = response.choices[0].message.content

    new_prd = models.PRD(
        project_id=project_id,
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

    return new_prd


# -----------------------------
# Refine an existing PRD
# -----------------------------
@router.put("/{project_id}/prds/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd(project_id: str, prd_id: UUID, refine_data: schemas.PRDRefine, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id, models.PRD.project_id == project_id).first()
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    prompt = f"""
Here is the current PRD:
{prd.content or ''}

User feedback for refinement:
{refine_data.instructions}

Please return an updated PRD in clean Markdown format,
applying the requested refinements while keeping everything else consistent.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an assistant that refines PRDs strictly in clean Markdown format."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    refined_content = response.choices[0].message["content"]

    new_version = prd.version + 1
    refined_prd = models.PRD(
        project_id=project_id,
        feature_name=prd.feature_name,
        description=prd.description,
        goals=prd.goals,
        content=refined_content,
        version=new_version,
        is_active=True,
    )

    prd.is_active = False
    db.add(refined_prd)
    db.commit()
    db.refresh(refined_prd)

    return refined_prd


# ---------------------------------------------------------
# ✅ Refine an existing PRD
# ---------------------------------------------------------
@router.put("/{project_id}/prds/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd(project_id: str, prd_id: UUID, refine_data: schemas.PRDRefine, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id, models.PRD.project_id == project_id).first()
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # 🔹 Build AI prompt
    prompt = f"""
Here is the current PRD:
{prd.content or ''}

User feedback for refinement:
{refine_data.instructions}

Please return an updated PRD in clean Markdown format,
applying the requested refinements while keeping everything else consistent.
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an assistant that refines PRDs strictly in clean Markdown format."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
    )

    refined_content = response.choices[0].message.content

    # 🔹 Save as a new PRD version
    new_version = prd.version + 1
    refined_prd = models.PRD(
        project_id=project_id,
        feature_name=prd.feature_name,
        description=prd.description,
        goals=prd.goals,
        content=refined_content,
        version=new_version,
        is_active=True,
    )

    # Mark old one as inactive
    prd.is_active = False

    db.add(refined_prd)
    db.commit()
    db.refresh(refined_prd)

    return refined_prd


# ---------------------------------------------------------
# ✅ List all PRDs for a project
# ---------------------------------------------------------
@router.get("/{project_id}/prds", response_model=list[schemas.PRDResponse])
def list_prds(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.PRD).filter(models.PRD.project_id == project_id).all()


# ---------------------------------------------------------
# ✅ Get a specific PRD by ID
# ---------------------------------------------------------
@router.get("/{project_id}/prds/{prd_id}", response_model=schemas.PRDResponse)
def get_prd(project_id: str, prd_id: UUID, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id, models.PRD.project_id == project_id).first()
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    return prd


# ---------------------------------------------------------
# ✅ Get the active PRD
# ---------------------------------------------------------
@router.get("/{project_id}/prd/active", response_model=schemas.PRDResponse)
def get_active_prd(project_id: str, db: Session = Depends(get_db)):
    prd = (
        db.query(models.PRD)
        .filter(models.PRD.project_id == project_id, models.PRD.is_active == True)
        .order_by(models.PRD.version.desc())
        .first()
    )
    if not prd:
        raise HTTPException(status_code=404, detail="No active PRD found")
    return prd


# ---------------------------------------------------------
# ✅ Export PRD to .docx
# ---------------------------------------------------------
@router.get("/{project_id}/prds/{prd_id}/export")
def export_prd(project_id: str, prd_id: UUID, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id, models.PRD.project_id == project_id).first()
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
