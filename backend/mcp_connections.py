from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import encrypt_secret
from backend.database import get_db
from backend.rbac import ensure_membership

router = APIRouter(prefix="/workspaces/{workspace_id}/mcp-connections", tags=["mcp_connections"])


def _connection_to_schema(record: models.WorkspaceMCPConnection) -> schemas.MCPConnectionResponse:
    payload = schemas.MCPConnectionResponse(
        id=record.id,
        workspace_id=record.workspace_id,
        name=record.name,
        description=record.description,
        endpoint_url=record.endpoint_url,
        tool_name=record.tool_name,
        prompt_field=record.prompt_field or "prompt",
        context_field=record.context_field,
        default_arguments=dict(record.default_arguments or {}),
        has_token=bool(record.auth_token_encrypted),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )
    return payload


@router.get("", response_model=list[schemas.MCPConnectionResponse])
def list_connections(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    records = (
        db.query(models.WorkspaceMCPConnection)
        .filter(models.WorkspaceMCPConnection.workspace_id == workspace_id)
        .order_by(models.WorkspaceMCPConnection.created_at.desc())
        .all()
    )
    return [_connection_to_schema(record) for record in records]


@router.post("", response_model=schemas.MCPConnectionResponse, status_code=201)
def create_connection(
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.MCPConnectionCreate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    record = models.WorkspaceMCPConnection(
        workspace_id=workspace_id,
        name=payload.name.strip(),
        description=payload.description,
        endpoint_url=str(payload.endpoint_url),
        tool_name=payload.tool_name.strip(),
        prompt_field=(payload.prompt_field or "prompt").strip(),
        context_field=(payload.context_field or None),
        default_arguments=dict(payload.default_arguments or {}),
        created_by=user_id,
        updated_by=user_id,
    )
    if payload.auth_token:
        record.auth_token_encrypted = encrypt_secret(payload.auth_token)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _connection_to_schema(record)


def _get_connection(db: Session, workspace_id: UUID, connection_id: UUID) -> models.WorkspaceMCPConnection:
    record = (
        db.query(models.WorkspaceMCPConnection)
        .filter(
            models.WorkspaceMCPConnection.workspace_id == workspace_id,
            models.WorkspaceMCPConnection.id == connection_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="MCP connection not found")
    return record


@router.patch("/{connection_id}", response_model=schemas.MCPConnectionResponse)
def update_connection(
    workspace_id: UUID,
    connection_id: UUID,
    user_id: UUID,
    payload: schemas.MCPConnectionUpdate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    record = _get_connection(db, workspace_id, connection_id)

    data = payload.model_dump(exclude_unset=True)
    if "auth_token" in data:
        token = data.pop("auth_token")
        if token:
            record.auth_token_encrypted = encrypt_secret(token)
    if data.pop("clear_auth_token", False):
        record.auth_token_encrypted = None
    for key, value in data.items():
        if key == "endpoint_url" and value is not None:
            setattr(record, key, str(value))
        elif key == "default_arguments" and value is not None:
            setattr(record, key, dict(value))
        elif value is not None:
            setattr(record, key, value)
    record.updated_by = user_id
    db.add(record)
    db.commit()
    db.refresh(record)
    return _connection_to_schema(record)


@router.delete("/{connection_id}", status_code=204)
def delete_connection(workspace_id: UUID, connection_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    record = _get_connection(db, workspace_id, connection_id)
    db.delete(record)
    db.commit()
    return None
