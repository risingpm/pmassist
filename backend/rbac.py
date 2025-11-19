from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend import models

WorkspaceRole = Literal["admin", "editor", "viewer"]
ProjectRole = Literal["owner", "contributor", "viewer"]

ROLE_ORDER: dict[WorkspaceRole, int] = {"viewer": 1, "editor": 2, "admin": 3}
ROLE_ALIASES: dict[str, WorkspaceRole] = {
    "owner": "admin",
    "member": "editor",
}

PROJECT_ROLE_ORDER: dict[ProjectRole, int] = {"viewer": 1, "contributor": 2, "owner": 3}



def normalize_role(role: str | None) -> WorkspaceRole:
    if not role:
        return "viewer"
    lowered = role.lower()
    if lowered in ROLE_ORDER:
        return lowered  # type: ignore[return-value]
    alias = ROLE_ALIASES.get(lowered)
    if alias:
        return alias
    return "viewer"


def validate_role_input(role: str | None) -> WorkspaceRole:
    if not role:
        return "viewer"
    lowered = role.lower()
    normalized = normalize_role(lowered)
    if normalized not in ROLE_ORDER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workspace role")
    return normalized


def role_allows(role: WorkspaceRole, required: WorkspaceRole) -> bool:
    return ROLE_ORDER[role] >= ROLE_ORDER[required]


def normalize_project_role(role: str | None) -> ProjectRole:
    if not role:
        return "viewer"
    lowered = role.lower()
    if lowered in PROJECT_ROLE_ORDER:
        return lowered  # type: ignore[return-value]
    if lowered == "admin":  # allow old values to map to owner
        return "owner"
    if lowered == "editor" or lowered == "contributor":
        return "contributor"
    return "viewer"


def validate_project_role_input(role: str | None) -> ProjectRole:
    normalized = normalize_project_role(role)
    if normalized not in PROJECT_ROLE_ORDER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project role")
    return normalized


def project_role_allows(role: ProjectRole, required: ProjectRole) -> bool:
    return PROJECT_ROLE_ORDER[role] >= PROJECT_ROLE_ORDER[required]


@dataclass
class WorkspacePermission:
    membership: models.WorkspaceMember
    role: WorkspaceRole


@dataclass
class ProjectPermission:
    workspace: WorkspacePermission
    membership: models.ProjectMember | None
    role: ProjectRole


def ensure_membership(
    db: Session,
    workspace_id: UUID,
    user_id: UUID,
    *,
    required_role: WorkspaceRole = "viewer",
) -> WorkspacePermission:
    membership = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == workspace_id,
            models.WorkspaceMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this workspace.",
        )

    normalized_role = normalize_role(membership.role)
    if not role_allows(normalized_role, required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace.",
        )

    return WorkspacePermission(membership=membership, role=normalized_role)


def get_membership_role(db: Session, workspace_id: UUID, user_id: UUID) -> WorkspaceRole | None:
    membership = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == workspace_id,
            models.WorkspaceMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        return None
    return normalize_role(membership.role)


def ensure_project_access(
    db: Session,
    workspace_id: UUID,
    project_id: UUID,
    user_id: UUID,
    *,
    required_role: ProjectRole = "viewer",
) -> ProjectPermission:
    workspace_perm = ensure_membership(db, workspace_id, user_id, required_role="viewer")

    if workspace_perm.role == "admin":
        effective_role: ProjectRole = "owner"
        membership = None
    else:
        membership = (
            db.query(models.ProjectMember)
            .filter(
                models.ProjectMember.project_id == project_id,
                models.ProjectMember.user_id == user_id,
            )
            .first()
        )
        effective_role = normalize_project_role(membership.role if membership else None)

        # workspace editors retain contributor-level baseline
        if effective_role == "viewer" and workspace_perm.role == "editor":
            effective_role = "contributor"

    if not project_role_allows(effective_role, required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient project permissions.",
        )

    return ProjectPermission(workspace=workspace_perm, membership=membership, role=effective_role)


def get_project_role(db: Session, workspace_id: UUID, project_id: UUID, user_id: UUID) -> ProjectRole:
    perm = ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")
    return perm.role
