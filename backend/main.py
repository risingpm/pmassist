from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel
from uuid import UUID
from .database import Base, engine, SessionLocal, get_db
from backend.knowledge import search, comments, prototypes, links, prototype_agent
from backend.knowledge import roadmap_ai
from .database import Base, engine, SessionLocal
from .models import Project
from . import prd, agent, auth, models
from .workspaces import workspaces_router, user_workspaces_router
from . import knowledge_base
from backend import roadmap_chat, roadmap, roadmap_phases, workspace_memory, workspace_agents
from backend import templates
from backend import mcp_connections
from backend import project_members
from backend import builder
from backend import dashboard
from backend import workspace_ai
from backend import strategy
from backend import tasks
from backend import tasks_ai
from backend import onboarding
from backend.rbac import ensure_membership, ensure_project_access

# Create tables if they don’t already exist
Base.metadata.create_all(bind=engine)

app = FastAPI()

static_dir = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

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
    north_star_metric: str | None = None
    target_personas: list[str] | None = None
    workspace_id: UUID


class ProjectUpdate(BaseModel):
    title: str
    description: str
    goals: str
    north_star_metric: str | None = None
    workspace_id: UUID
    target_personas: list[str] | None = None

# -----------------------------
# Routes
# -----------------------------

@app.get("/health")
def health_check():
    return {"status": "ok"}


# Create project
@app.post("/projects")
def create_project(project: ProjectCreate, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, project.workspace_id, user_id, required_role="editor")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == project.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    db_project = Project(
        title=project.title,
        description=project.description,
        goals=project.goals,
        north_star_metric=project.north_star_metric,
        target_personas=project.target_personas,
        workspace_id=project.workspace_id,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    existing_project_membership = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == db_project.id,
            models.ProjectMember.user_id == user_id,
        )
        .first()
    )
    if not existing_project_membership:
        db.add(models.ProjectMember(project_id=db_project.id, user_id=user_id, role="owner"))
        db.commit()
    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals,
        "north_star_metric": db_project.north_star_metric,
        "target_personas": db_project.target_personas,
        "workspace_id": db_project.workspace_id,
    }}


# List all projects
@app.get("/projects")
def list_projects(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    projects = db.query(Project).filter(Project.workspace_id == workspace_id).all()
    return {"projects": [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "goals": p.goals,
            "north_star_metric": p.north_star_metric,
            "target_personas": p.target_personas,
            "workspace_id": p.workspace_id,
        }
        for p in projects
    ]}


# Get a single project
@app.get("/projects/{project_id}")
def get_project(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    project = query.first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "project": {
        "title": project.title,
        "description": project.description,
        "goals": project.goals,
        "north_star_metric": project.north_star_metric,
        "target_personas": project.target_personas,
        "workspace_id": project.workspace_id,
    }}


# Update project
@app.put("/projects/{project_id}")
def update_project(
    project_id: str,
    project: ProjectUpdate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    db_project = query.first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_project.title = project.title
    db_project.description = project.description
    db_project.goals = project.goals
    db_project.north_star_metric = project.north_star_metric
    if project.target_personas is not None:
        db_project.target_personas = project.target_personas
    db.commit()
    db.refresh(db_project)

    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals,
        "north_star_metric": db_project.north_star_metric,
        "target_personas": db_project.target_personas,
        "workspace_id": db_project.workspace_id,
    }}


# Delete project
@app.delete("/projects/{project_id}")
def delete_project(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="owner")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    db_project = query.first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()

    return {"id": project_id, "deleted": True}


# -----------------------------
# Include Feature Routers
# -----------------------------
app.include_router(roadmap_ai.router)
app.include_router(comments.router)
app.include_router(search.router)
app.include_router(prototypes.router)
app.include_router(links.router)
app.include_router(prototype_agent.router)
app.include_router(prd.router)
app.include_router(prd.embeddings_router)
app.include_router(agent.router)
app.include_router(knowledge_base.router)
app.include_router(roadmap_chat.router)
app.include_router(roadmap.router)
app.include_router(roadmap_phases.router)
app.include_router(workspace_memory.router)
app.include_router(workspace_agents.router)
app.include_router(workspace_agents.templates_router)
app.include_router(builder.router)
app.include_router(dashboard.router)
app.include_router(tasks.workspace_router)
app.include_router(tasks.task_router)
app.include_router(tasks_ai.router)
app.include_router(project_members.router)
app.include_router(templates.router)
app.include_router(mcp_connections.router)
app.include_router(strategy.router)
app.include_router(workspace_ai.router)
app.include_router(onboarding.router)
app.include_router(workspaces_router)
app.include_router(user_workspaces_router)
app.include_router(auth.router)
