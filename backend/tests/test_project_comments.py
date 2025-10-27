import os
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models, schemas
from backend.knowledge import comments as comments_router
from backend.workspaces import create_workspace_with_owner

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping project comment tests", allow_module_level=True)


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


def test_comment_lifecycle(db_session):
    author = models.User(email=f"commenter_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(author)
    db_session.commit()

    workspace = create_workspace_with_owner(db_session, name="Comment Space", owner_id=author.id)

    project = models.Project(
        title="Commented Project",
        description="Testing comments",
        goals="Improve collaboration",
        north_star_metric=None,
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()

    payload = schemas.ProjectCommentCreate(content="  First insight ", tags=["insight"], author_id=author.id)
    created = comments_router.create_project_comment(
        project_id=project.id,
        payload=payload,
        workspace_id=workspace.id,
        db=db_session,
    )

    assert created.content == "First insight"
    assert created.tags == ["insight"]

    listed = comments_router.list_project_comments(project.id, workspace.id, db_session)
    assert len(listed) == 1
    assert listed[0].id == created.id

    updated = comments_router.update_project_comment(
        project_id=project.id,
        comment_id=created.id,
        payload=schemas.ProjectCommentUpdate(content="Updated note", tags=["risk"]),
        workspace_id=workspace.id,
        db=db_session,
    )
    assert updated.content == "Updated note"
    assert updated.tags == ["risk"]

    response = comments_router.delete_project_comment(
        project_id=project.id,
        comment_id=created.id,
        workspace_id=workspace.id,
        db=db_session,
    )
    assert response["deleted"] is True

    remaining = comments_router.list_project_comments(project.id, workspace.id, db_session)
    assert remaining == []
