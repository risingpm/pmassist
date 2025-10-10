from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from openai import OpenAI
import os
import json
from dotenv import load_dotenv

from .database import get_db
from .models import Project, Roadmap

# Load environment variables
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

router = APIRouter()


@router.post("/projects/{id}/roadmap")
def generate_roadmap(id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Prompt for AI
    prompt = f"""
    You are a product manager assistant.
    Generate a roadmap in terms of **features**, not timelines.
    Separate features into:
    - MVP Features (must-have for launch)
    - Future Iterations (nice-to-have, future versions)
    Do NOT include dates, milestones, or timelines.

    Project Description: {project.description}
    Goals: {project.goals}
    North Star Metric: {project.north_star_metric or 'Not specified'}

    Format output strictly as JSON:
    {{
      "mvp_features": [
        "Feature 1",
        "Feature 2"
      ],
      "future_iterations": [
        "Feature 3",
        "Feature 4"
      ]
    }}
    """

    # Call OpenAI
    response = client.chat.completions.create(
        model="gpt-4.1",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}   # ✅ ensures proper JSON
    )

    # Parse JSON properly
    roadmap_json = json.loads(response.choices[0].message.content)

    # Deactivate old roadmaps
    db.query(Roadmap).filter(
        Roadmap.project_id == id, Roadmap.is_active == True
    ).update({"is_active": False})

    # Save new roadmap
    roadmap = Roadmap(project_id=id, content=roadmap_json, is_active=True)
    db.add(roadmap)
    db.commit()
    db.refresh(roadmap)

    return roadmap


@router.get("/projects/{id}/roadmap")
def get_active_roadmap(id: str, db: Session = Depends(get_db)):
    roadmap = db.query(Roadmap).filter(
        Roadmap.project_id == id, Roadmap.is_active == True
    ).first()
    if not roadmap:
        raise HTTPException(status_code=404, detail="No roadmap found")
    return roadmap
