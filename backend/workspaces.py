import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from .database import get_db
from . import models, schemas
from backend.rbac import ensure_membership, normalize_role, validate_role_input, ROLE_ORDER

workspaces_router = APIRouter(prefix="/workspaces", tags=["workspaces"])
user_workspaces_router = APIRouter(prefix="/users", tags=["workspaces"])

INVITE_TTL_DAYS = 14


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _display_name(email: str | None) -> str:
    if not email:
        return "Unknown"
    local = email.split("@", 1)[0]
    cleaned = local.replace(".", " ").replace("_", " ").strip()
    return cleaned.title() or email


def _serialize_member(member: models.WorkspaceMember) -> schemas.WorkspaceMemberResponse:
    email = member.user.email if member.user and member.user.email else ""
    return schemas.WorkspaceMemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=email,
        display_name=_display_name(email),
        role=normalize_role(member.role),
        joined_at=member.created_at,
    )


def _serialize_invitation(invite: models.WorkspaceInvitation) -> schemas.WorkspaceInvitationResponse:
    return schemas.WorkspaceInvitationResponse(
        id=invite.id,
        workspace_id=invite.workspace_id,
        email=invite.email,
        role=normalize_role(invite.role),
        token=invite.token,
        invited_by=invite.invited_by,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        cancelled_at=invite.cancelled_at,
    )


def _pending_invites_query(db: Session, workspace_id: UUID):
    return (
        db.query(models.WorkspaceInvitation)
        .filter(
            models.WorkspaceInvitation.workspace_id == workspace_id,
            models.WorkspaceInvitation.accepted_at.is_(None),
            models.WorkspaceInvitation.cancelled_at.is_(None),
        )
    )


def _ensure_remaining_admins(db: Session, workspace_id: UUID, exclude_member_id: UUID | None = None):
    memberships = (
        db.query(models.WorkspaceMember)
        .filter(models.WorkspaceMember.workspace_id == workspace_id)
        .all()
    )
    admins = [
        member
        for member in memberships
        if normalize_role(member.role) == "admin" and member.id != exclude_member_id
    ]
    if not admins:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace must retain at least one admin.",
        )


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
    db: Session, *, name: str, owner_id: UUID, role: str = "admin"
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
        db.query(models.Workspace, models.WorkspaceMember)
        .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
        .filter(models.WorkspaceMember.user_id == user_id)
        .order_by(models.Workspace.created_at.asc())
        .all()
    )
    results: list[schemas.WorkspaceResponse] = []
    for workspace, membership in memberships:
        results.append(
            schemas.WorkspaceResponse(
                id=workspace.id,
                name=workspace.name,
                owner_id=workspace.owner_id,
                created_at=workspace.created_at,
                updated_at=workspace.updated_at,
                role=normalize_role(membership.role),
            )
        )
    return results


@workspaces_router.post("", response_model=schemas.WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: schemas.WorkspaceCreate, owner_id: UUID, db: Session = Depends(get_db)):
    owner = db.query(models.User).filter(models.User.id == owner_id).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner not found")

    workspace = models.Workspace(name=payload.name, owner_id=owner_id)
    db.add(workspace)
    db.flush()

    membership = models.WorkspaceMember(workspace_id=workspace.id, user_id=owner_id, role="admin")
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return workspace


@workspaces_router.put("/{workspace_id}", response_model=schemas.WorkspaceResponse)
def update_workspace(
    workspace_id: UUID,
    payload: schemas.WorkspaceUpdate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    ctx = ensure_membership(db, workspace_id, user_id, required_role="admin")

    workspace.name = payload.name.strip()
    if not workspace.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace name required")

    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return schemas.WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        owner_id=workspace.owner_id,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        role=ctx.role,
    )


@workspaces_router.get("/{workspace_id}/members", response_model=list[schemas.WorkspaceMemberResponse])
def list_workspace_members(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    members = (
        db.query(models.WorkspaceMember)
        .options(joinedload(models.WorkspaceMember.user))
        .filter(models.WorkspaceMember.workspace_id == workspace_id)
        .order_by(models.WorkspaceMember.created_at.asc())
        .all()
    )
    return [_serialize_member(member) for member in members]


@workspaces_router.put(
    "/{workspace_id}/members/{member_id}",
    response_model=schemas.WorkspaceMemberResponse,
)
def update_workspace_member_role(
    workspace_id: UUID,
    member_id: UUID,
    payload: schemas.WorkspaceMemberRoleUpdate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="admin")

    member = (
        db.query(models.WorkspaceMember)
        .options(joinedload(models.WorkspaceMember.user))
        .filter(
            models.WorkspaceMember.id == member_id,
            models.WorkspaceMember.workspace_id == workspace_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    new_role = validate_role_input(payload.role)
    current_role = normalize_role(member.role)

    if current_role == "admin" and new_role != "admin":
        _ensure_remaining_admins(db, workspace_id, exclude_member_id=member.id)

    member.role = new_role
    db.add(member)
    db.commit()
    db.refresh(member)
    return _serialize_member(member)


@workspaces_router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_workspace_member(workspace_id: UUID, member_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ctx = ensure_membership(db, workspace_id, user_id, required_role="admin")

    member = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.id == member_id,
            models.WorkspaceMember.workspace_id == workspace_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if member.user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own membership.",
        )

    if normalize_role(member.role) == "admin":
        _ensure_remaining_admins(db, workspace_id, exclude_member_id=member.id)

    db.delete(member)

    (
        db.query(models.ProjectMember)
        .join(models.Project, models.ProjectMember.project_id == models.Project.id)
        .filter(
            models.Project.workspace_id == workspace_id,
            models.ProjectMember.user_id == member.user_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()


@workspaces_router.get(
    "/{workspace_id}/invitations",
    response_model=list[schemas.WorkspaceInvitationResponse],
)
def list_workspace_invitations(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="admin")
    invites = (
        _pending_invites_query(db, workspace_id)
        .order_by(models.WorkspaceInvitation.created_at.desc())
        .all()
    )
    return [_serialize_invitation(invite) for invite in invites]


@workspaces_router.post(
    "/{workspace_id}/invite",
    response_model=schemas.WorkspaceInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_workspace_member(
    workspace_id: UUID,
    payload: schemas.WorkspaceInviteRequest,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="admin")

    normalized_email = _normalize_email(payload.email)
    requested_role = validate_role_input(payload.role)

    existing_user = (
        db.query(models.User)
        .filter(models.User.email == normalized_email)
        .first()
    )
    if existing_user:
        existing_member = (
            db.query(models.WorkspaceMember)
            .filter(
                models.WorkspaceMember.workspace_id == workspace_id,
                models.WorkspaceMember.user_id == existing_user.id,
            )
            .first()
        )
        if existing_member:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member")

    active_invite = (
        _pending_invites_query(db, workspace_id)
        .filter(models.WorkspaceInvitation.email == normalized_email)
        .first()
    )
    if active_invite:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already sent to this email")

    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)
    invite = models.WorkspaceInvitation(
        workspace_id=workspace_id,
        email=normalized_email,
        role=requested_role,
        token=token,
        invited_by=user_id,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return _serialize_invitation(invite)


@workspaces_router.post("/invitations/{token}/accept", response_model=schemas.WorkspaceMemberResponse)
def accept_workspace_invitation(
    token: str,
    payload: schemas.WorkspaceInvitationAcceptRequest,
    db: Session = Depends(get_db),
):
    invite = (
        db.query(models.WorkspaceInvitation)
        .filter(models.WorkspaceInvitation.token == token)
        .first()
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invite.cancelled_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation was cancelled")
    if invite.accepted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already accepted")
    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expired")

    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user or not user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User profile incomplete")

    if _normalize_email(user.email) != invite.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invitation email mismatch")

    membership = (
        db.query(models.WorkspaceMember)
        .options(joinedload(models.WorkspaceMember.user))
        .filter(
            models.WorkspaceMember.workspace_id == invite.workspace_id,
            models.WorkspaceMember.user_id == payload.user_id,
        )
        .first()
    )

    desired_role = validate_role_input(invite.role)
    if membership:
        current_role = normalize_role(membership.role)
        if ROLE_ORDER[current_role] < ROLE_ORDER[desired_role]:
            membership.role = desired_role
            db.add(membership)
    else:
        membership = models.WorkspaceMember(
            workspace_id=invite.workspace_id,
            user_id=payload.user_id,
            role=desired_role,
        )
        db.add(membership)

    invite.accepted_at = datetime.now(timezone.utc)
    db.add(invite)
    db.commit()

    refreshed = (
        db.query(models.WorkspaceMember)
        .options(joinedload(models.WorkspaceMember.user))
        .filter(models.WorkspaceMember.workspace_id == invite.workspace_id, models.WorkspaceMember.user_id == payload.user_id)
        .first()
    )
    return _serialize_member(refreshed or membership)
