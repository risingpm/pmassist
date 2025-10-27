import os
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models, schemas
from backend.knowledge import links as links_router
from backend.workspaces import create_workspace_with_owner

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping project link tests", allow_module_level=True)

engine = create_engine(DATABASE_URL)
SessionTesting = sessionmaker(bind=engine)


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionTesting(bind=connection)
    models.Base.metadata.create_all(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def test_link_crud(db_session):
    owner = models.User(email=f"link_owner_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Links Space", owner_id=owner.id)

    project = models.Project(
        title="Links Project",
        description="",
        goals="",
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()

    create_payload = schemas.ProjectLinkCreate(
        workspace_id=workspace.id,
        label="Design brief",
        url="https://example.com/design",
        description="Initial design doc",
        tags=["design"],
    )

    created = links_router.create_link(
        project_id=project.id,
        payload=create_payload,
        db=db_session,
    )

    assert created.label == "Design brief"
    assert created.url == "https://example.com/design"

    listed = links_router.list_links(project.id, workspace.id, db_session)
    assert len(listed) == 1
    assert listed[0].id == created.id

    response = links_router.delete_link(project.id, created.id, workspace.id, db_session)
    assert response["deleted"] is True

    remaining = links_router.list_links(project.id, workspace.id, db_session)
    assert remaining == []
