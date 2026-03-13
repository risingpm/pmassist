import os
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models, schemas
from backend.workspaces import (
    create_workspace_with_owner,
    get_project_in_workspace,
    get_workspace_invitation_by_token,
    invite_workspace_member,
    resend_workspace_invitation,
)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping workspace tests", allow_module_level=True)

engine = create_engine(DATABASE_URL)
SessionTesting = sessionmaker(bind=engine)


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionTesting(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def test_create_workspace_with_owner(db_session):
    user = models.User(email=f"workspace_test_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(user)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="QA Workspace", owner_id=user.id)

    assert workspace.name == "QA Workspace"
    assert workspace.owner_id == user.id

    membership = (
        db_session.query(models.WorkspaceMember)
        .filter(models.WorkspaceMember.workspace_id == workspace.id)
        .all()
    )
    assert len(membership) == 1
    assert membership[0].user_id == user.id
    assert membership[0].role == "admin"


def test_get_project_in_workspace(db_session):
    owner = models.User(email=f"workspace_lookup_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Lookup Space", owner_id=owner.id)

    project = models.Project(
        title="Workspace Project",
        description="Test project",
        goals="Goals",
        north_star_metric=None,
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()

    found = get_project_in_workspace(db_session, project.id, workspace.id)
    assert found.id == project.id

    with pytest.raises(HTTPException):
        get_project_in_workspace(db_session, project.id, uuid.uuid4())


def test_resend_workspace_invitation(db_session, monkeypatch):
    owner = models.User(email=f"resend_owner_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Email Space", owner_id=owner.id)

    sent_payloads: list[dict[str, str]] = []

    def fake_send(**kwargs):
        sent_payloads.append(kwargs)

    monkeypatch.setattr("backend.workspaces.send_workspace_invite_email", fake_send)

    invite = invite_workspace_member(
        workspace.id,
        schemas.WorkspaceInviteRequest(email=f"pending_{uuid.uuid4()}@example.com", role="viewer"),
        owner.id,
        db_session,
    )

    assert len(sent_payloads) == 1

    record = (
        db_session.query(models.WorkspaceInvitation)
        .filter(models.WorkspaceInvitation.id == invite.id)
        .first()
    )
    assert record is not None
    previous_expiration = record.expires_at

    sent_payloads.clear()
    response = resend_workspace_invitation(workspace.id, record.id, owner.id, db_session)

    assert response.id == record.id
    assert len(sent_payloads) == 1

    db_session.refresh(record)
    assert record.expires_at > previous_expiration
    assert record.invited_by == owner.id


def test_get_workspace_invitation_by_token(db_session):
    owner = models.User(email=f"lookup_invite_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Invite Lookup", owner_id=owner.id)

    invite = invite_workspace_member(
        workspace.id,
        schemas.WorkspaceInviteRequest(email=f"lookup_{uuid.uuid4()}@example.com", role="viewer"),
        owner.id,
        db_session,
    )

    result = get_workspace_invitation_by_token(invite.token, db_session)
    assert result.workspace_id == workspace.id
    assert result.workspace_name == workspace.name
    assert result.email == invite.email
