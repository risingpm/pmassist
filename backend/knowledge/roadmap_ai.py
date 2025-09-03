import os
import json
import uuid
from fastapi import APIRouter, Depends
from openai import OpenAI
from sqlalchemy.orm import Session
from backend.models import Document, Project, Roadmap
from backend.database import get_db

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_roadmap(project_id: str, db: Session):
    project = db.query(Project).filter(Project.id == project_id).first()
    docs = db.query(Document).filter(Document.project_id == project_id).all()

    if not project:
        return {"error": "Project not found"}

    # Combine project + docs context
    combined_text = f"Project: {project.title}\nDescription: {project.description}\nGoals: {project.goals}\n\n"
    combined_text += "\n".join([d.content for d in docs])

    prompt = f"""
    You are a Product Manager AI.

    Based on the project info and PRDs below:

    1. Identify the **features already implemented** (from the description and documents). 
       - Group them into categories under "existing_features".
       - Do NOT include any future ideas here. 
       - This is strictly the current state of the product.

    2. Then create a **forward-looking roadmap**:
       - MVP: features that should be prioritized for the next immediate milestone.
       - Phase 2: mid-term enhancements (next 3-6 months).
       - Phase 3: long-term vision, ambitious or strategic expansions (6+ months).
       - Roadmap should **not duplicate existing features** — only include new, future-oriented items.
       - Be bold and visionary in later phases.

    Output strictly valid JSON only. 
    Do NOT include markdown formatting, no triple backticks, no language tags. 
    Follow this schema exactly:

    {{
      "existing_features": {{
        "Category 1": ["Feature A", "Feature B"],
        "Category 2": ["Feature C"]
      }},
      "roadmap": [
        {{"phase": "MVP", "items": ["Feature X", "Feature Y"]}},
        {{"phase": "Phase 2", "items": ["Feature Z"]}},
        {{"phase": "Phase 3", "items": ["Feature W"]}}
      ]
    }}

    Context:\n{combined_text}
    """


    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )

    roadmap_json = response.choices[0].message.content.strip()

    # ✅ Safety: remove code fences if GPT still adds them
    if roadmap_json.startswith("```"):
        roadmap_json = roadmap_json.strip("`")
        roadmap_json = roadmap_json.replace("json", "", 1).strip()

    # Try to parse as JSON
    try:
        roadmap_data = json.loads(roadmap_json)
    except Exception as e:
        return {
            "error": f"Failed to parse roadmap JSON: {str(e)}",
            "raw_output": roadmap_json
        }

    # Deactivate old roadmaps for this project
    db.query(Roadmap).filter(
        Roadmap.project_id == project_id,
        Roadmap.is_active == True
    ).update({"is_active": False})

    # Save new roadmap
    new_roadmap = Roadmap(
        id=uuid.uuid4(),
        project_id=project_id,
        content=roadmap_data,
        is_active=True
    )
    db.add(new_roadmap)
    db.commit()
    db.refresh(new_roadmap)

    return {
        "roadmap": roadmap_data,
        "created_at": new_roadmap.created_at.isoformat()
    }


# ------------------ FastAPI Router ------------------

router = APIRouter(prefix="/roadmap-ai", tags=["roadmap-ai"])

@router.post("/{project_id}")
def generate_project_roadmap(project_id: str, db: Session = Depends(get_db)):
    """Generate (or regenerate) roadmap for a project"""
    return generate_roadmap(project_id, db)

@router.get("/{project_id}")
def get_latest_roadmap(project_id: str, db: Session = Depends(get_db)):
    """Fetch the latest active roadmap for a project"""
    roadmap = (
        db.query(Roadmap)
        .filter(Roadmap.project_id == project_id, Roadmap.is_active == True)
        .order_by(Roadmap.created_at.desc())
        .first()
    )
    if not roadmap:
        return {"message": "No roadmap found"}
    return {
        "roadmap": roadmap.content,
        "created_at": roadmap.created_at.isoformat()
    }
