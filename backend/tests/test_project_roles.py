import os
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models
from backend.rbac import ensure_project_access
from backend.workspaces import create_workspace_with_owner

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping project role tests", allow_module_level=True)

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


def create_user(session, prefix: str = "user"):
    user = models.User(email=f"{prefix}_{uuid.uuid4()}@example.com", password_hash="dummy")
    session.add(user)
    session.commit()
    return user


def test_project_access_enforces_roles(db_session):
    owner = create_user(db_session, "owner")
    viewer = create_user(db_session, "viewer")

    workspace = create_workspace_with_owner(db_session, name="Role Space", owner_id=owner.id)

    membership_viewer = models.WorkspaceMember(workspace_id=workspace.id, user_id=viewer.id, role="viewer")
    db_session.add(membership_viewer)
    db_session.commit()

    project = models.Project(
        title="Project",
        description="",
        goals="",
        north_star_metric=None,
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()

    db_session.add(
        models.ProjectMember(project_id=project.id, user_id=viewer.id, role="contributor")
    )
    db_session.commit()

    perm_owner = ensure_project_access(db_session, workspace.id, project.id, owner.id, required_role="owner")
    assert perm_owner.role == "owner"

    perm_contrib = ensure_project_access(db_session, workspace.id, project.id, viewer.id, required_role="contributor")
    assert perm_contrib.role == "contributor"

    with pytest.raises(HTTPException):
        ensure_project_access(db_session, workspace.id, project.id, viewer.id, required_role="owner")
