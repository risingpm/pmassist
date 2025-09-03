from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .database import Base, engine, SessionLocal, get_db
from backend.knowledge import documents, search
from .database import Base, engine, SessionLocal
from .models import Project
from . import roadmap   # 👈 NEW: import roadmap endpoints

# Create tables if they don’t already exist
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS middleware (allow everything for now)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -----------------------------
# Pydantic Schemas
# -----------------------------
class ProjectCreate(BaseModel):
    title: str
    description: str
    goals: str

class ProjectUpdate(BaseModel):
    title: str
    description: str
    goals: str

# -----------------------------
# Routes
# -----------------------------

@app.get("/health")
def health_check():
    return {"status": "ok"}


# Create project
@app.post("/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(
        title=project.title,
        description=project.description,
        goals=project.goals
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals
    }}


# List all projects
@app.get("/projects")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    return {"projects": [
        {"id": p.id, "title": p.title, "description": p.description, "goals": p.goals}
        for p in projects
    ]}


# Get a single project
@app.get("/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "project": {
        "title": project.title,
        "description": project.description,
        "goals": project.goals
    }}


# Update project
@app.put("/projects/{project_id}")
def update_project(project_id: str, project: ProjectUpdate, db: Session = Depends(get_db)):
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_project.title = project.title
    db_project.description = project.description
    db_project.goals = project.goals
    db.commit()
    db.refresh(db_project)

    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals
    }}


# Delete project
@app.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()

    return {"id": project_id, "deleted": True}


# -----------------------------
# Include Roadmap Router
# -----------------------------
app.include_router(roadmap.router)

app.include_router(documents.router)
app.include_router(search.router)

from backend.knowledge import documents, roadmap_ai

app.include_router(documents.router)
app.include_router(roadmap_ai.router)
