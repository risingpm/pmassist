import os
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy import inspect
from sqlalchemy.orm import sessionmaker

from backend import models
from backend.knowledge_base import create_text_entry, list_kb_entries
from backend.knowledge_base_service import ensure_workspace_kb
from backend.schemas import KnowledgeBaseEntryCreate

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    pytest.skip("DATABASE_URL env var not set; skipping knowledge base tests", allow_module_level=True)

engine = create_engine(DATABASE_URL)
SessionTesting = sessionmaker(bind=engine)
inspector = inspect(engine)
document_columns = {column["name"] for column in inspector.get_columns("documents")}

if "kb_entry_id" not in document_columns:
    pytest.skip(
        "documents table missing kb_entry_id column; run latest migrations before KB tests",
        allow_module_level=True,
    )


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


def create_workspace(db_session):
    owner = models.User(email=f"kb_owner_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(owner)
    db_session.commit()

    workspace = models.Workspace(name=f"Knowledge Base {uuid.uuid4()}", owner_id=owner.id)
    db_session.add(workspace)
    db_session.commit()

    membership = models.WorkspaceMember(workspace_id=workspace.id, user_id=owner.id, role="admin")
    db_session.add(membership)
    db_session.commit()

    ensure_workspace_kb(db_session, workspace.id)
    return workspace, owner


def add_member(db_session, workspace, role: str):
    user = models.User(email=f"kb_member_{role}_{uuid.uuid4()}@example.com", password_hash="dummy")
    db_session.add(user)
    db_session.commit()

    membership = models.WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=role)
    db_session.add(membership)
    db_session.commit()
    return user


def create_project(db_session, workspace):
    project = models.Project(
        title=f"KB Project {uuid.uuid4()}",
        description="Knowledge base test project",
        goals="Ship KB",
        workspace_id=workspace.id,
    )
    db_session.add(project)
    db_session.commit()
    return project


def test_editor_can_create_project_entry(db_session):
    workspace, _owner = create_workspace(db_session)
    editor = add_member(db_session, workspace, role="editor")
    project = create_project(db_session, workspace)

    payload = KnowledgeBaseEntryCreate(
        type="research",
        title="Release Checklist",
        content="Scope and QA notes",
        project_id=project.id,
        tags=["release"],
    )
    entry = create_text_entry(workspace.id, editor.id, payload, db=db_session)

    assert entry.project_id == project.id
    assert entry.title == "Release Checklist"

    entries = list_kb_entries(
        workspace.id,
        editor.id,
        entry_type=None,
        search=None,
        limit=200,
        project_id=project.id,
        db=db_session,
    )
    assert any(result.id == entry.id for result in entries)


def test_viewer_cannot_create_entry(db_session):
    workspace, _owner = create_workspace(db_session)
    viewer = add_member(db_session, workspace, role="viewer")

    payload = KnowledgeBaseEntryCreate(type="insight", title="Viewer attempt", content="read-only")

    with pytest.raises(HTTPException) as exc_info:
        create_text_entry(workspace.id, viewer.id, payload, db=db_session)

    assert exc_info.value.status_code == 403


def test_project_filter_returns_matches(db_session):
    workspace, owner = create_workspace(db_session)
    project_target = create_project(db_session, workspace)
    other_project = create_project(db_session, workspace)

    payload_target = KnowledgeBaseEntryCreate(
        type="document",
        title="Target Entry",
        content="target content",
        project_id=project_target.id,
    )
    payload_other = KnowledgeBaseEntryCreate(
        type="document",
        title="Other Entry",
        content="other content",
        project_id=other_project.id,
    )

    create_text_entry(workspace.id, owner.id, payload_target, db=db_session)
    create_text_entry(workspace.id, owner.id, payload_other, db=db_session)

    viewer = add_member(db_session, workspace, role="viewer")

    filtered = list_kb_entries(
        workspace.id,
        viewer.id,
        entry_type=None,
        search=None,
        limit=200,
        project_id=project_target.id,
        db=db_session,
    )
    assert len(filtered) == 1
    assert filtered[0].title == "Target Entry"
