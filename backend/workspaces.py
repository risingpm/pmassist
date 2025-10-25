from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from . import models, schemas

workspaces_router = APIRouter(prefix="/workspaces", tags=["workspaces"])
user_workspaces_router = APIRouter(prefix="/users", tags=["workspaces"])


def get_current_workspace(db: Session, user_id: UUID) -> models.Workspace | None:
    membership = (
        db.query(models.WorkspaceMember)
        .filter(models.WorkspaceMember.user_id == user_id)
        .order_by(models.WorkspaceMember.created_at.asc())
        .first()
    )
    if membership:
        return membership.workspace
    return None


def get_project_in_workspace(
    db: Session, project_id: str, workspace_id: UUID | None
) -> models.Project:
    query = db.query(models.Project).filter(models.Project.id == project_id)
    if workspace_id is not None:
        query = query.filter(models.Project.workspace_id == workspace_id)
    project = query.first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def create_workspace_with_owner(
    db: Session, *, name: str, owner_id: UUID, role: str = "owner"
) -> models.Workspace:
    workspace = models.Workspace(name=name, owner_id=owner_id)
    db.add(workspace)
    db.flush()

    membership = models.WorkspaceMember(
        workspace_id=workspace.id,
        user_id=owner_id,
        role=role,
    )
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return workspace


@user_workspaces_router.get("/{user_id}/workspaces", response_model=list[schemas.WorkspaceResponse])
def list_user_workspaces(user_id: UUID, db: Session = Depends(get_db)):
    memberships = (
        db.query(models.Workspace)
        .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
        .filter(models.WorkspaceMember.user_id == user_id)
        .order_by(models.Workspace.created_at.asc())
        .all()
    )
    return memberships


@workspaces_router.post("", response_model=schemas.WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: schemas.WorkspaceCreate, owner_id: UUID, db: Session = Depends(get_db)):
    owner = db.query(models.User).filter(models.User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner not found")

    workspace = models.Workspace(name=payload.name, owner_id=owner_id)
    db.add(workspace)
    db.flush()

    membership = models.WorkspaceMember(workspace_id=workspace.id, user_id=owner_id, role="owner")
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return workspace


@workspaces_router.put("/{workspace_id}", response_model=schemas.WorkspaceResponse)
def update_workspace(workspace_id: UUID, payload: schemas.WorkspaceUpdate, db: Session = Depends(get_db)):
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    workspace.name = payload.name.strip()
    if not workspace.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace name required")

    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace
