from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.rbac import ensure_membership

router = APIRouter(prefix="/workspaces/{workspace_id}/onboarding", tags=["onboarding"])


STEP_ORDER = ["complete_profile", "create_project", "add_team_members", "generate_prd"]


def _build_onboarding_steps(db: Session, workspace: models.Workspace) -> list[schemas.WorkspaceOnboardingStep]:
    owner_profile_complete = bool(workspace.owner and workspace.owner.display_name)

    project_count = (
        db.query(func.count(models.Project.id)).filter(models.Project.workspace_id == workspace.id).scalar() or 0
    )
    member_count = (
        db.query(func.count(models.WorkspaceMember.id)).filter(models.WorkspaceMember.workspace_id == workspace.id).scalar()
        or 0
    )
    prd_count = db.query(func.count(models.PRD.id)).filter(models.PRD.workspace_id == workspace.id).scalar() or 0

    step_map: dict[str, bool] = {
        "complete_profile": owner_profile_complete,
        "create_project": project_count > 0,
        "add_team_members": member_count > 1,
        "generate_prd": prd_count > 0,
    }

    return [
        schemas.WorkspaceOnboardingStep(id=step_id, completed=bool(step_map.get(step_id, False)))
        for step_id in STEP_ORDER
    ]


def _serialize_onboarding_status(workspace: models.Workspace, steps: list[schemas.WorkspaceOnboardingStep]):
    completed_steps = sum(1 for step in steps if step.completed)
    next_step: Optional[str] = None
    for step in steps:
        if not step.completed:
            next_step = step.id
            break

    return schemas.WorkspaceOnboardingStatus(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        user_name=workspace.owner.display_name if workspace.owner else None,
        welcome_acknowledged=bool(workspace.onboarding_acknowledged),
        steps=steps,
        completed_steps=completed_steps,
        total_steps=len(steps),
        next_step_id=next_step,
    )


@router.get("", response_model=schemas.WorkspaceOnboardingStatus)
def get_onboarding_status(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    steps = _build_onboarding_steps(db, workspace)
    return _serialize_onboarding_status(workspace, steps)


@router.patch("", response_model=schemas.WorkspaceOnboardingStatus)
def update_onboarding_status(
    workspace_id: UUID,
    payload: schemas.WorkspaceOnboardingUpdate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    updated = False
    if payload.welcome_acknowledged is not None:
        workspace.onboarding_acknowledged = payload.welcome_acknowledged
        updated = True

    if updated:
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

    steps = _build_onboarding_steps(db, workspace)
    return _serialize_onboarding_status(workspace, steps)
