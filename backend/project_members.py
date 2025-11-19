from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend import models, schemas
from backend.rbac import ensure_project_access, normalize_role, validate_project_role_input
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/projects", tags=["project-members"])


def _display_name(email: str | None) -> str:
    if not email:
        return "Unknown"
    local = email.split("@", 1)[0]
    cleaned = local.replace(".", " ").replace("_", " ").strip()
    return cleaned.title() or email


def _serialize_member(member: models.ProjectMember, inherited: bool = False) -> schemas.ProjectMemberResponse:
    email = member.user.email if member.user and member.user.email else ""
    return schemas.ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        email=email,
        display_name=_display_name(email),
        role=validate_project_role_input(member.role),
        inherited=inherited,
        joined_at=member.created_at,
    )


@router.get("/{project_id}/members", response_model=list[schemas.ProjectMemberResponse])
def list_project_members(project_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    project = get_project_in_workspace(db, str(project_id), workspace_id)
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")

    members = (
        db.query(models.ProjectMember)
        .options(joinedload(models.ProjectMember.user))
        .filter(models.ProjectMember.project_id == project_id)
        .order_by(models.ProjectMember.created_at.asc())
        .all()
    )
    serialized = [_serialize_member(member) for member in members]

    workspace_admins = (
        db.query(models.WorkspaceMember)
        .options(joinedload(models.WorkspaceMember.user))
        .filter(models.WorkspaceMember.workspace_id == project.workspace_id)
        .all()
    )

    existing_user_ids = {member.user_id for member in serialized}
    for admin in workspace_admins:
        if normalize_role(admin.role) != "admin":
            continue
        if admin.user_id in existing_user_ids:
            continue
        email = admin.user.email if admin.user and admin.user.email else ""
        serialized.append(
            schemas.ProjectMemberResponse(
                id=None,
                project_id=project.id,
                user_id=admin.user_id,
                email=email,
                display_name=_display_name(email),
                role="owner",
                inherited=True,
                joined_at=admin.created_at,
            )
        )
    return serialized


@router.post("/{project_id}/members", response_model=schemas.ProjectMemberResponse, status_code=201)
def add_project_member(
    project_id: UUID,
    payload: schemas.ProjectMemberCreateRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, str(project_id), workspace_id)
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="owner")

    target_membership = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == workspace_id,
            models.WorkspaceMember.user_id == payload.user_id,
        )
        .first()
    )
    if not target_membership:
        raise HTTPException(status_code=400, detail="User must join the workspace first")

    if normalize_role(target_membership.role) == "admin":
        raise HTTPException(status_code=400, detail="Workspace admins already administer all projects")

    existing = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User already belongs to this project")

    role = validate_project_role_input(payload.role)
    member = models.ProjectMember(project_id=project.id, user_id=payload.user_id, role=role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return _serialize_member(member)


@router.put("/{project_id}/members/{member_id}", response_model=schemas.ProjectMemberResponse)
def update_project_member_role(
    project_id: UUID,
    member_id: UUID,
    payload: schemas.ProjectMemberRoleUpdate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, str(project_id), workspace_id)
    perm = ensure_project_access(db, workspace_id, project_id, user_id, required_role="owner")

    membership = (
        db.query(models.ProjectMember)
        .options(joinedload(models.ProjectMember.user))
        .filter(
            models.ProjectMember.id == member_id,
            models.ProjectMember.project_id == project_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Project member not found")

    if membership.user_id == perm.workspace.membership.user_id and perm.role != "owner":
        raise HTTPException(status_code=400, detail="You cannot modify your own membership")

    membership.role = validate_project_role_input(payload.role)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return _serialize_member(membership)


@router.delete("/{project_id}/members/{member_id}", status_code=204)
def remove_project_member(
    project_id: UUID,
    member_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    get_project_in_workspace(db, str(project_id), workspace_id)
    perm = ensure_project_access(db, workspace_id, project_id, user_id, required_role="owner")

    membership = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.id == member_id,
            models.ProjectMember.project_id == project_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Project member not found")

    if membership.user_id == perm.workspace.membership.user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself from the project")

    db.delete(membership)
    db.commit()


@router.get("/{project_id}/membership", response_model=dict)
def get_self_project_role(project_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    get_project_in_workspace(db, str(project_id), workspace_id)
    perm = ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")
    return {"role": perm.role}
