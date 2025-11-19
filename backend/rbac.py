from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend import models

WorkspaceRole = Literal["admin", "editor", "viewer"]

ROLE_ORDER: dict[WorkspaceRole, int] = {"viewer": 1, "editor": 2, "admin": 3}
ROLE_ALIASES: dict[str, WorkspaceRole] = {
    "owner": "admin",
    "member": "editor",
}


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


@dataclass
class WorkspacePermission:
    membership: models.WorkspaceMember
    role: WorkspaceRole


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
