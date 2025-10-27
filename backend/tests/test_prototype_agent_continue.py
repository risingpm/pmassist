from uuid import uuid4
from datetime import datetime, timezone

import pytest

from backend import models, schemas
from backend.knowledge import prototype_agent


class FakeQuery:
    def __init__(self, data):
        self._data = data

    def filter(self, *args, **kwargs):
        return self

    def filter_by(self, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        if isinstance(self._data, list):
            return self._data
        return [self._data]

    def first(self):
        if isinstance(self._data, list):
            return self._data[0] if self._data else None
        return self._data


class FakeSession:
    def __init__(self, project, proto_session):
        self.project = project
        self.proto_session = proto_session
        self.messages = []
        self._last_added = None

    def query(self, model):
        if model is models.Project:
            return FakeQuery(self.project)
        if model is models.PrototypeSession:
            return FakeQuery(self.proto_session)
        if model is models.PrototypeMessage:
            return FakeQuery(self.messages)
        raise NotImplementedError(f"Query not supported for {model}")

    def add(self, obj):
        if isinstance(obj, models.PrototypeMessage):
            obj.created_at = datetime.now(timezone.utc)
            obj.id = uuid4()
            self.messages.append(obj)
            if self.proto_session and hasattr(self.proto_session, "messages"):
                self.proto_session.messages.append(obj)
        elif isinstance(obj, models.PrototypeSession):
            self.proto_session = obj
        self._last_added = obj

    def flush(self):
        return None

    def commit(self):
        return None

    def refresh(self, obj):
        return None

    def close(self):
        return None


@pytest.fixture
def setup_project():
    workspace_id = uuid4()
    project = models.Project(
        id=str(uuid4()),
        title="Metrics Project",
        description="Help aspiring PMs succeed",
        goals="Learn fast",
        workspace_id=workspace_id,
    )
    proto_session = models.PrototypeSession(
        id=uuid4(),
        project_id=project.id,
        workspace_id=workspace_id,
    )
    proto_session.created_at = datetime.now(timezone.utc)
    proto_session.updated_at = proto_session.created_at
    proto_session.messages = []
    project.prototype_sessions = [proto_session]
    return project, proto_session


def test_continue_session_persists_assistant_metrics(monkeypatch, setup_project):
    project, proto_session = setup_project
    fake_db = FakeSession(project, proto_session)

    metrics = [
        "Total Certified Product Managers",
        "Course Completion Rate",
    ]

    def fake_call_agent(**_kwargs):
        spec = schemas.PrototypeSpec(
            title="Metrics Project · Concept",
            summary="Spec summary",
            goal="Learn fast",
            key_screens=[
                schemas.PrototypeScreen(
                    name="Metrics Page",
                    goal="Showcase metrics",
                    primary_actions=[],
                    components=[],
                )
            ],
            success_metrics=["User trusts the data"],
            metadata={"assistant_metrics": metrics},
        )
        return spec, "Updated metrics"

    monkeypatch.setattr(prototype_agent, "_call_agent", fake_call_agent)
    monkeypatch.setattr(prototype_agent, "build_static_bundle", lambda *_args, **_kwargs: ("bundle/path", "bundle/url"))

    request = schemas.PrototypeSessionMessageRequest(
        workspace_id=proto_session.workspace_id,
        message="Update metrics",
    )

    response = prototype_agent.continue_session(
        project_id=project.id,
        session_id=proto_session.id,
        payload=request,
        db=fake_db,
    )

    assert response.latest_spec is not None
    assert response.latest_spec.metadata
    assert response.latest_spec.metadata.get("assistant_metrics") == metrics
    assert response.bundle_url == "bundle/url"
    assistant_messages = [msg for msg in response.messages if msg.role == "assistant"]
    assert assistant_messages
    assert assistant_messages[-1].content == "Updated metrics"
