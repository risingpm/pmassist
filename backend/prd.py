from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from .database import get_db
from . import models, schemas

from openai import OpenAI
import os
import json

from fastapi.responses import FileResponse
from docx import Document as DocxDocument
import tempfile

from dotenv import load_dotenv

# ✅ Load environment variables
load_dotenv()

# ✅ OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter(
    prefix="/projects",
    tags=["prds"]
)

# ---------------------------------------------------------
# ✅ Generate a new PRD
# ---------------------------------------------------------
@router.post("/{project_id}/prd", response_model=schemas.PRDResponse)
def generate_prd(project_id: str, prd_data: schemas.PRDCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 🔹 Collect existing features
    features = []
    roadmaps = db.query(models.Roadmap).filter(models.Roadmap.project_id == project_id).all()
    if roadmaps:
        features.append("Roadmap generation already available")
    docs = db.query(models.Document).filter(models.Document.project_id == project_id).all()
    if docs:
        features.append("Knowledge documents available for embedding")

    # 🔹 Build AI prompt
    prompt = f"""
    Generate a structured Product Requirements Document (PRD) in JSON format.
    Project Title: {project.title}
    Description: {project.description}
    Goals: {project.goals}

    Existing Features: {features}

    {prd_data.prompt or ""}

    Structure the PRD with these fields:
    - objective
    - scope
    - success_metrics
    - engineering_requirements
    - future_work
    """

    # 🔹 Call OpenAI with JSON response mode
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an assistant that generates PRDs strictly in valid JSON format."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )

    raw_content = response.choices[0].message.content

    try:
        prd_json = json.loads(raw_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PRD JSON: {str(e)} | Raw: {raw_content[:200]}")

    # 🔹 Save PRD
    new_prd = models.PRD(
        project_id=project_id,
        content=prd_json,
        version=1,
        is_active=True,
    )
    db.add(new_prd)
    db.commit()
    db.refresh(new_prd)

    return new_prd


# ---------------------------------------------------------
# ✅ Refine an existing PRD
# ---------------------------------------------------------
@router.put("/prds/{prd_id}/refine", response_model=schemas.PRDResponse)
def refine_prd(prd_id: UUID, refine_data: schemas.PRDRefine, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id).first()
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # 🔹 Build AI prompt
    prompt = f"""
    Here is the current PRD in JSON format:
    {json.dumps(prd.content, indent=2)}

    User feedback for refinement:
    {refine_data.instructions}

    Please return an updated PRD in the same JSON structure,
    applying the requested refinements while keeping everything else consistent.
    """

    # 🔹 Call OpenAI with JSON response mode
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an assistant that refines PRDs strictly in valid JSON format."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        response_format={"type": "json_object"},
    )

    raw_content = response.choices[0].message.content

    try:
        refined_json = json.loads(raw_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse refined PRD JSON: {str(e)} | Raw: {raw_content[:200]}")

    # 🔹 Save as a new PRD version
    new_version = prd.version + 1
    refined_prd = models.PRD(
        project_id=prd.project_id,
        content=refined_json,
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
@router.get("/prds/{prd_id}/export")
def export_prd(prd_id: UUID, db: Session = Depends(get_db)):
    prd = db.query(models.PRD).filter(models.PRD.id == prd_id).first()
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")

    # Create Word document
    doc = DocxDocument()
    doc.add_heading("Product Requirements Document (PRD)", level=0)

    # Add sections from PRD content
    content = prd.content
    for section, value in content.items():
        doc.add_heading(section.replace("_", " ").title(), level=1)
        if isinstance(value, list):
            for item in value:
                doc.add_paragraph(f"- {item}")
        elif isinstance(value, dict):
            for k, v in value.items():
                doc.add_paragraph(f"{k}: {v}")
        else:
            doc.add_paragraph(str(value))

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"PRD_{prd.id}.docx"
    )
