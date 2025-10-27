import os
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models, schemas
from backend.knowledge import prototype_agent
from backend.workspaces import create_workspace_with_owner

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping prototype agent tests", allow_module_level=True)

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


def test_prototype_agent_flow(db_session):
    owner = models.User(email=f"agent_owner_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Agent Space", owner_id=owner.id)

    project = models.Project(
        title="Agent Project",
        description="",
        goals="Ship agent-based prototypes",
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()

    create_payload = schemas.PrototypeSessionCreateRequest(workspace_id=workspace.id, prompt="Create onboarding experience")
    session_response = prototype_agent.start_session(
        project_id=project.id,
        payload=create_payload,
        db=db_session,
    )

    assert session_response.id
    assert session_response.bundle_url is not None or session_response.latest_spec is not None
    assert len(session_response.messages) >= 1

    message_payload = schemas.PrototypeSessionMessageRequest(
        workspace_id=workspace.id,
        message="Add success metric tracking",
    )
    updated_session = prototype_agent.continue_session(
        project_id=project.id,
        session_id=session_response.id,
        payload=message_payload,
        db=db_session,
    )

    assert updated_session.id == session_response.id
    assert any(msg.role == "assistant" for msg in updated_session.messages)
    assert updated_session.bundle_url is not None
