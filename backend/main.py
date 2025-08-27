from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict
import uuid
from fastapi import HTTPException


app = FastAPI()

# Still keep CORSMiddleware for normal requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Fallback: catch ALL OPTIONS requests manually
@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request, rest_of_path: str):
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

# -----------------------
# Project API
# -----------------------

projects: Dict[str, dict] = {}

class Project(BaseModel):
    title: str
    description: str
    goals: str

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/projects")
def create_project(project: Project):
    project_id = str(uuid.uuid4())
    projects[project_id] = project.dict()
    return {"id": project_id, "project": projects[project_id]}

@app.get("/projects/{project_id}")
def get_project(project_id: str):
    if project_id not in projects:
        return {"error": "Project not found"}
    return {"id": project_id, "project": projects[project_id]}

@app.get("/projects")
def list_projects():
    return {"projects": [{"id": pid, **pdata} for pid, pdata in projects.items()]}

@app.put("/projects/{project_id}")
def update_project(project_id: str, project: Project):
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    projects[project_id] = project.dict()
    return {"id": project_id, "project": projects[project_id]}

@app.delete("/projects/{project_id}")
def delete_project(project_id: str):
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    deleted = projects.pop(project_id)
    return {"id": project_id, "deleted": deleted}
