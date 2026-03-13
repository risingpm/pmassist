from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.rbac import ensure_membership

router = APIRouter(prefix="/workspaces/{workspace_id}/onboarding", tags=["onboarding"])


STEP_ORDER = ["create_project", "set_goals", "generate_roadmap", "write_prd", "build_agent"]


def _serialize_steps(steps: list[schemas.WorkspaceOnboardingStep]) -> list[dict[str, Optional[str]]]:
    return [
        {
            "id": step.id,
            "completed": step.completed,
            "completed_at": step.completed_at.isoformat() if step.completed_at else None,
        }
        for step in steps
    ]


def _coerce_steps(state: list[dict[str, object]] | None) -> list[schemas.WorkspaceOnboardingStep]:
    lookup = {entry.get("id"): entry for entry in (state or []) if isinstance(entry, dict) and entry.get("id")}
    steps: list[schemas.WorkspaceOnboardingStep] = []
    for step_id in STEP_ORDER:
        entry = lookup.get(step_id) or {}
        completed = bool(entry.get("completed"))
        raw_completed_at = entry.get("completed_at")
        completed_at = None
        if isinstance(raw_completed_at, str):
            try:
                completed_at = datetime.fromisoformat(raw_completed_at)
            except ValueError:
                completed_at = None
        steps.append(schemas.WorkspaceOnboardingStep(id=step_id, completed=completed, completed_at=completed_at))
    return steps


def _get_or_init_steps(db: Session, workspace: models.Workspace) -> list[schemas.WorkspaceOnboardingStep]:
    steps = _coerce_steps(workspace.onboarding_steps_state)
    if not workspace.onboarding_steps_state or len(workspace.onboarding_steps_state) != len(steps):
        workspace.onboarding_steps_state = _serialize_steps(steps)
        db.add(workspace)
        db.commit()
        db.refresh(workspace)
    return steps


def _complete_step(
    db: Session, workspace: models.Workspace, step_id: str
) -> list[schemas.WorkspaceOnboardingStep]:
    steps = _coerce_steps(workspace.onboarding_steps_state)
    changed = False
    for step in steps:
        if step.id == step_id and not step.completed:
            step.completed = True
            step.completed_at = datetime.now(timezone.utc)
            changed = True
            break
    if changed:
        workspace.onboarding_steps_state = _serialize_steps(steps)
        db.add(workspace)
        db.commit()
        db.refresh(workspace)
    return steps


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
        onboarding_profile=workspace.onboarding_profile or None,
        partner_name=workspace.ai_partner_name,
        partner_focus=list(workspace.ai_partner_focus or []),
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
    steps = _get_or_init_steps(db, workspace)
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

    steps = _get_or_init_steps(db, workspace)
    updated = False
    if payload.welcome_acknowledged is not None:
        workspace.onboarding_acknowledged = payload.welcome_acknowledged
        updated = True

    if payload.partner_name is not None:
        workspace.ai_partner_name = payload.partner_name.strip() or None
        updated = True

    if payload.partner_focus is not None:
        workspace.ai_partner_focus = payload.partner_focus
        updated = True

    if payload.onboarding_profile is not None:
        workspace.onboarding_profile = payload.onboarding_profile.model_dump(exclude_none=True)
        updated = True

    if payload.complete_step_id:
        steps = _complete_step(db, workspace, payload.complete_step_id)
    elif updated:
        workspace.onboarding_steps_state = _serialize_steps(steps)
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

    if payload.complete_step_id and not any(step.id == payload.complete_step_id for step in steps):
        steps = _get_or_init_steps(db, workspace)

    return _serialize_onboarding_status(workspace, steps)
