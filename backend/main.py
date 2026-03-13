import json
import logging
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from uuid import UUID
from .database import Base, engine, SessionLocal, get_db
from backend.knowledge import search, comments, prototypes, links, prototype_agent
from backend.knowledge import roadmap_ai
from .database import Base, engine, SessionLocal
from .models import Project
from . import prd, agent, auth, models
from .workspaces import workspaces_router, user_workspaces_router
from . import knowledge_base
from backend import roadmap_chat, roadmap, roadmap_context, roadmap_phases, workspace_memory, workspace_agents
from backend import templates
from backend import mcp_connections
from backend import project_members
from backend import builder
from backend import dashboard
from backend import workspace_ai
from backend import strategy
from backend import tasks
from backend import tasks_ai
from backend import task_boards
from backend import onboarding
from backend import payments
from backend import usage
from backend.project_research import (
    ingest_project_website,
    normalize_project_website,
    clear_project_website_research,
)
from backend.ai_providers import get_openai_client
from backend.knowledge_base_service import ensure_workspace_kb, update_entry_embedding
from backend.rbac import ensure_membership, ensure_project_access

# Create tables if they don’t already exist
Base.metadata.create_all(bind=engine)

app = FastAPI()
logger = logging.getLogger(__name__)

static_dir = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# CORS middleware (allow everything for now)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -----------------------------
# Pydantic Schemas
# -----------------------------
class ProjectCreate(BaseModel):
    title: str
    description: str
    goals: str
    north_star_metric: str | None = None
    target_personas: list[str] | None = None
    workspace_id: UUID
    website_url: str | None = None
    attributes: dict[str, dict[str, Any]] | None = None
    color: str | None = None


class ProjectUpdate(BaseModel):
    title: str
    description: str
    goals: str
    north_star_metric: str | None = None
    workspace_id: UUID
    target_personas: list[str] | None = None
    website_url: str | None = None
    attributes: dict[str, dict[str, Any]] | None = None
    color: str | None = None


class ProjectBuilderMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ProjectBuilderRequest(BaseModel):
    messages: list[ProjectBuilderMessage]
    attributes: dict[str, dict[str, Any]] | None = None


class ProjectBuilderResponse(BaseModel):
    assistant_message: str
    attributes: dict[str, dict[str, Any]]
    suggested_description: str | None = None


class ProjectContextEntry(BaseModel):
    title: str | None = None
    content: str | None = None
    source_url: str | None = None


class ProjectBriefRequest(BaseModel):
    attributes: dict[str, dict[str, Any]] | None = None
    context_entries: list[ProjectContextEntry] | None = None


class ProjectBriefResponse(BaseModel):
    summary: str
    bullets: list[str]


# -----------------------------
# Project builder helpers
# -----------------------------
_ATTRIBUTE_KEY_PATTERN = re.compile(r"[^a-z0-9]+")


def _normalize_attribute_key(raw: str) -> str:
    cleaned = (raw or "").strip().lower()
    cleaned = _ATTRIBUTE_KEY_PATTERN.sub("_", cleaned).strip("_")
    return cleaned or "attribute"


def _format_attribute_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if item is not None)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _sentence_case(value: str | None) -> str | None:
    if not value:
        return value
    trimmed = value.strip()
    if not trimmed:
        return trimmed
    return trimmed[0].upper() + trimmed[1:]


def _merge_attributes(
    base: dict[str, dict[str, Any]] | None,
    updates: dict[str, dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for key, payload in (base or {}).items():
        normalized = _normalize_attribute_key(payload.get("label") or key)
        merged[normalized] = {
            "label": payload.get("label") or key.replace("_", " ").title(),
            "value": payload.get("value"),
            "source": payload.get("source") or "chat",
            "confidence": payload.get("confidence"),
        }
    for key, payload in (updates or {}).items():
        normalized = _normalize_attribute_key(payload.get("label") or key)
        merged[normalized] = {
            "label": payload.get("label") or key.replace("_", " ").title(),
            "value": payload.get("value"),
            "source": payload.get("source") or "chat",
            "confidence": payload.get("confidence"),
        }
    return merged


_PROJECT_NAME_KEYS = {"project_name", "name", "title"}
_DESCRIPTION_KEYS = {"description", "about", "summary"}
_GOAL_KEYS = {"goals", "goal", "objective", "objectives"}
_PERSONA_KEYS = {"target_personas", "target_users", "personas", "users"}
_COPY_PROTECTED_KEYS = _PROJECT_NAME_KEYS | _DESCRIPTION_KEYS | _GOAL_KEYS


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _truncate_sentence(value: str, limit: int) -> str:
    text = _normalize_whitespace(value)
    if len(text) <= limit:
        return text
    clipped = text[:limit].rsplit(" ", 1)[0].strip()
    return clipped or text[:limit].strip()


def _normalize_personas(value: Any) -> list[str]:
    def _jira_persona_pack() -> list[str]:
        return [
            "Product managers leading cross-functional delivery in agile teams",
            "Engineering managers coordinating sprint capacity, dependencies, and timelines",
            "Scrum masters and project coordinators tracking execution health and blockers",
            "Tech leads and developers managing issue workflows across multiple squads",
        ]

    def _expand_persona_hint(item: str) -> list[str] | None:
        normalized = _normalize_whitespace(item).lower()
        if not normalized:
            return None
        if "jira" in normalized:
            return _jira_persona_pack()
        if re.fullmatch(r"[a-z0-9 _-]+ users?", normalized):
            product = re.sub(r"\s+users?$", "", normalized).strip()
            if product:
                return [
                    f"Product and engineering teams with {product.title()}-style workflow needs",
                    "Project leads needing clear sprint planning, ownership, and progress visibility",
                ]
        return None

    raw_items: list[str] = []
    if isinstance(value, list):
        raw_items = [str(item) for item in value if item is not None]
    elif isinstance(value, str):
        raw_items = re.split(r"[,;\n]+", value)
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        expanded = _expand_persona_hint(item)
        if expanded:
            for candidate in expanded:
                normalized_candidate = _truncate_sentence(candidate, 96)
                if not normalized_candidate:
                    continue
                candidate_key = normalized_candidate.lower()
                if candidate_key in seen:
                    continue
                seen.add(candidate_key)
                cleaned.append(_sentence_case(normalized_candidate) or normalized_candidate)
                if len(cleaned) >= 8:
                    return cleaned
            continue

        normalized = _truncate_sentence(item, 64)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(_sentence_case(normalized) or normalized)
        if len(cleaned) >= 8:
            break
    return cleaned


def _sanitize_builder_attributes(
    merged: dict[str, dict[str, Any]],
    *,
    latest_user_message: str,
    previous_attributes: dict[str, dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    previous_values: dict[str, Any] = {}
    for key, payload in (previous_attributes or {}).items():
        normalized_key = _normalize_attribute_key(payload.get("label") or key)
        previous_values[normalized_key] = payload.get("value")

    latest_user_normalized = _normalize_whitespace(latest_user_message).lower()

    for key, payload in merged.items():
        value = payload.get("value")
        previous_value = previous_values.get(key)

        if key in _PERSONA_KEYS:
            personas = _normalize_personas(value)
            if personas:
                payload["value"] = personas
            elif isinstance(previous_value, list) and previous_value:
                payload["value"] = previous_value
            continue

        if not isinstance(value, str):
            continue

        normalized_value = _normalize_whitespace(value)
        if not normalized_value:
            if isinstance(previous_value, str) and _normalize_whitespace(previous_value):
                payload["value"] = _normalize_whitespace(previous_value)
            continue

        if key in _COPY_PROTECTED_KEYS and latest_user_normalized and normalized_value.lower() == latest_user_normalized:
            if isinstance(previous_value, str) and _normalize_whitespace(previous_value):
                normalized_value = _normalize_whitespace(previous_value)

        if key in _PROJECT_NAME_KEYS:
            normalized_value = _truncate_sentence(normalized_value, 80)
            normalized_value = _sentence_case(normalized_value) or normalized_value
        elif key in _DESCRIPTION_KEYS:
            normalized_value = _truncate_sentence(normalized_value, 360)
            normalized_value = _sentence_case(normalized_value) or normalized_value
        elif key in _GOAL_KEYS:
            normalized_value = _truncate_sentence(normalized_value, 240)
            normalized_value = _sentence_case(normalized_value) or normalized_value
        else:
            normalized_value = _truncate_sentence(normalized_value, 320)

        payload["value"] = normalized_value

    return merged


def _call_project_builder(
    db: Session,
    workspace_id: UUID,
    *,
    messages: list[ProjectBuilderMessage],
    attributes: dict[str, dict[str, Any]] | None,
) -> ProjectBuilderResponse:
    client = get_openai_client(db, workspace_id)
    conversation = "\n".join(f"{msg.role}: {msg.content}" for msg in messages)
    payload = json.dumps(attributes or {}, ensure_ascii=False)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior product manager helping a user define a project end-to-end. "
                    "Act like a product leader: proactively surface missing details, ask crisp follow-ups, "
                    "and help the user articulate strategy, scope, users, success metrics, and constraints. "
                    "Respond conversationally and update the project attributes based on the latest message. "
                    "Return ONLY valid JSON with keys: assistant_message (string), attributes (object), "
                    "and suggested_description (string or null). "
                    "Attributes should map keys to objects with label, value, source, confidence. "
                    "Keep existing attributes unless the user contradicts them. "
                    "Synthesize and normalize user input into concise product language. "
                    "Do not paste the user's raw message verbatim into structured fields. "
                    "For project_name use a short title (max 80 chars). "
                    "For description provide a clear summary (2-3 sentences). "
                    "For goals provide concise outcomes, not chat transcript text. "
                    "For target_personas return role-based personas with context and job-to-be-done, "
                    "not tool-only labels like 'JIRA users'. "
                    "If you can rewrite the project description more clearly based on the conversation, "
                    "return it in suggested_description; otherwise null."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Conversation:\n"
                    f"{conversation}\n\n"
                    "Current attributes (JSON):\n"
                    f"{payload}\n\n"
                    "Return the JSON response now."
                ),
            },
        ],
        temperature=0.3,
    )
    content = response.choices[0].message.content or ""
    try:
        parsed = json.loads(content)
        assistant_message = str(parsed.get("assistant_message") or "").strip()
        updated_attrs = parsed.get("attributes") or {}
        suggested_description = parsed.get("suggested_description")
        if suggested_description is not None:
            suggested_description = str(suggested_description).strip() or None
        if not isinstance(updated_attrs, dict):
            updated_attrs = {}
        latest_user_message = next(
            (msg.content for msg in reversed(messages) if msg.role == "user" and msg.content.strip()),
            "",
        )
        merged_attributes = _merge_attributes(attributes, updated_attrs)
        sanitized_attributes = _sanitize_builder_attributes(
            merged_attributes,
            latest_user_message=latest_user_message,
            previous_attributes=attributes,
        )
        return ProjectBuilderResponse(
            assistant_message=assistant_message or "Got it. Anything else to add?",
            attributes=sanitized_attributes,
            suggested_description=suggested_description,
        )
    except json.JSONDecodeError:
        return ProjectBuilderResponse(
            assistant_message=content.strip() or "Got it. Anything else to add?",
            attributes=attributes or {},
        )


def _call_project_brief(
    db: Session,
    workspace_id: UUID,
    *,
    attributes: dict[str, dict[str, Any]] | None,
    context_entries: list[ProjectContextEntry] | None,
) -> ProjectBriefResponse:
    def _extract_json_block(raw: str) -> str:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return cleaned[start : end + 1]
        return cleaned

    client = get_openai_client(db, workspace_id)
    attribute_lines = []
    for key, payload in (attributes or {}).items():
        label = payload.get("label") or key.replace("_", " ").title()
        value = _format_attribute_value(payload.get("value"))
        if value:
            attribute_lines.append(f"- {label}: {value}")
    context_lines = []
    for entry in (context_entries or [])[:5]:
        content = (entry.content or "").strip()
        if content:
            content = content[:1200]
        source = f" ({entry.source_url})" if entry.source_url else ""
        title = (entry.title or "Context").strip()
        context_lines.append(f"- {title}{source}: {content}")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior product manager. Create a concise project brief using the "
                    "inputs provided. Return ONLY valid JSON with keys: summary (string, 1-2 paragraphs) "
                    "and bullets (array of 3-5 short bullets for scope/features)."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Project attributes:\n"
                    f"{chr(10).join(attribute_lines) or 'None'}\n\n"
                    "Additional context:\n"
                    f"{chr(10).join(context_lines) or 'None'}\n\n"
                    "Generate the JSON response now."
                ),
            },
        ],
        temperature=0.4,
    )
    content = response.choices[0].message.content or ""
    try:
        parsed = json.loads(_extract_json_block(content))
        summary = str(parsed.get("summary") or "").strip()
        bullets = parsed.get("bullets") or []
        if not isinstance(bullets, list):
            bullets = []
        bullets = [str(item).strip() for item in bullets if str(item).strip()]
        return ProjectBriefResponse(
            summary=summary or "Project brief unavailable.",
            bullets=bullets[:5],
        )
    except json.JSONDecodeError:
        return ProjectBriefResponse(summary=content.strip() or "Project brief unavailable.", bullets=[])

# -----------------------------
# Routes
# -----------------------------

@app.get("/health")
def health_check():
    return {"status": "ok"}


# Project builder chat
@app.post("/projects/builder/chat", response_model=ProjectBuilderResponse)
def project_builder_chat(
    payload: ProjectBuilderRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    if not payload.messages:
        raise HTTPException(status_code=400, detail="Messages required")
    return _call_project_builder(db, workspace_id, messages=payload.messages, attributes=payload.attributes)


@app.post("/projects/builder/brief", response_model=ProjectBriefResponse)
def project_builder_brief(
    payload: ProjectBriefRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    return _call_project_brief(
        db,
        workspace_id,
        attributes=payload.attributes,
        context_entries=payload.context_entries,
    )


# Create project
@app.post("/projects")
def create_project(project: ProjectCreate, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, project.workspace_id, user_id, required_role="editor")
    workspace = db.query(models.Workspace).filter(models.Workspace.id == project.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    normalized_url = normalize_project_website(project.website_url)
    normalized_title = _sentence_case(project.title) or project.title
    normalized_description = _sentence_case(project.description) or project.description
    raw_attributes = project.attributes or {}
    normalized_attributes = _merge_attributes(
        raw_attributes,
        {
            "project_name": {"label": "Project Name", "value": normalized_title, "source": "chat"},
            "description": {"label": "Description", "value": normalized_description, "source": "chat"},
            "goals": {"label": "Goals", "value": project.goals, "source": "chat"},
            "target_personas": {"label": "Target Personas", "value": project.target_personas, "source": "chat"},
            "north_star_metric": {"label": "North Star Metric", "value": project.north_star_metric, "source": "chat"},
            "website_url": {"label": "Website", "value": normalized_url, "source": "chat"},
        },
    )
    db_project = Project(
        title=normalized_title,
        description=normalized_description,
        goals=project.goals,
        north_star_metric=project.north_star_metric,
        target_personas=project.target_personas,
        workspace_id=project.workspace_id,
        website_url=normalized_url,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    existing_project_membership = (
        db.query(models.ProjectMember)
        .filter(
            models.ProjectMember.project_id == db_project.id,
            models.ProjectMember.user_id == user_id,
        )
        .first()
    )
    if not existing_project_membership:
        db.add(models.ProjectMember(project_id=db_project.id, user_id=user_id, role="owner"))
        db.commit()
    if project.color or normalized_attributes:
        try:
            if project.color:
                db_project.color = project.color
            if normalized_attributes:
                db_project.attributes = normalized_attributes
            db.add(db_project)
            db.commit()
            db.refresh(db_project)
        except Exception as exc:  # pragma: no cover - best-effort persistence
            db.rollback()
            logger.warning("Failed to persist project attributes/color for %s: %s", db_project.id, exc)

    if normalized_attributes:
        try:
            kb = ensure_workspace_kb(db, project.workspace_id)
            for key, payload in normalized_attributes.items():
                value = _format_attribute_value(payload.get("value"))
                if not value:
                    continue
                entry = models.KnowledgeBaseEntry(
                    kb_id=kb.id,
                    type="ai_output",
                    title=payload.get("label") or key.replace("_", " ").title(),
                    content=value,
                    project_id=db_project.id,
                    created_by=user_id,
                    tags=["project_attribute", f"project:{db_project.id}", f"attr:{key}"],
                )
                db.add(entry)
                update_entry_embedding(db, entry, workspace_id=project.workspace_id, text_override=value)
            db.commit()
        except Exception as exc:  # pragma: no cover - best-effort KB persistence
            db.rollback()
            logger.warning("Failed to persist project KB attributes for %s: %s", db_project.id, exc)
    if normalized_url:
        try:
            ingest_project_website(db, db_project, user_id)
        except Exception as exc:  # pragma: no cover - network best-effort
            logger.warning("Failed to ingest website context for project %s: %s", db_project.id, exc)
    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals,
        "north_star_metric": db_project.north_star_metric,
        "target_personas": db_project.target_personas,
        "color": db_project.color,
        "attributes": db_project.attributes or {},
        "workspace_id": db_project.workspace_id,
        "website_url": db_project.website_url,
    }}


# List all projects
@app.get("/projects")
def list_projects(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    prd_counts = (
        db.query(
            models.PRD.project_id.label("project_id"),
            func.count(models.PRD.id).label("prd_count"),
            func.max(models.PRD.updated_at).label("prd_updated"),
        )
        .filter(models.PRD.workspace_id == workspace_id, models.PRD.project_id.isnot(None))
        .group_by(models.PRD.project_id)
        .subquery()
    )
    task_counts = (
        db.query(
            models.Task.project_id.label("project_id"),
            func.count(models.Task.id).label("task_count"),
            func.max(models.Task.updated_at).label("task_updated"),
        )
        .filter(models.Task.workspace_id == workspace_id, models.Task.project_id.isnot(None))
        .group_by(models.Task.project_id)
        .subquery()
    )
    rows = (
        db.query(
            Project,
            func.coalesce(prd_counts.c.prd_count, 0).label("prd_count"),
            prd_counts.c.prd_updated.label("prd_updated"),
            func.coalesce(task_counts.c.task_count, 0).label("task_count"),
            task_counts.c.task_updated.label("task_updated"),
        )
        .outerjoin(prd_counts, prd_counts.c.project_id == Project.id)
        .outerjoin(task_counts, task_counts.c.project_id == Project.id)
        .filter(Project.workspace_id == workspace_id)
        .all()
    )
    results = []
    for project, prd_count, prd_updated, task_count, task_updated in rows:
        last_updated = None
        if prd_updated and task_updated:
            last_updated = max(prd_updated, task_updated)
        else:
            last_updated = prd_updated or task_updated
        results.append(
            {
                "id": project.id,
                "title": project.title,
                "description": project.description,
                "goals": project.goals,
                "north_star_metric": project.north_star_metric,
                "target_personas": project.target_personas,
                "color": project.color,
                "attributes": project.attributes or {},
                "workspace_id": project.workspace_id,
                "website_url": project.website_url,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "prd_count": int(prd_count or 0),
                "task_count": int(task_count or 0),
                "last_updated": last_updated.isoformat() if last_updated else None,
            }
        )
    return {"projects": results}


# Get a single project
@app.get("/projects/{project_id}")
def get_project(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    project = query.first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "project": {
        "title": project.title,
        "description": project.description,
        "goals": project.goals,
        "north_star_metric": project.north_star_metric,
        "target_personas": project.target_personas,
        "color": project.color,
        "attributes": project.attributes or {},
        "workspace_id": project.workspace_id,
        "website_url": project.website_url,
    }}


# Update project
@app.put("/projects/{project_id}")
def update_project(
    project_id: str,
    project: ProjectUpdate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    db_project = query.first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    previous_url = db_project.website_url
    normalized_url = normalize_project_website(project.website_url)
    normalized_title = _sentence_case(project.title) or project.title
    normalized_description = _sentence_case(project.description) or project.description
    db_project.title = normalized_title
    db_project.description = normalized_description
    db_project.goals = project.goals
    db_project.north_star_metric = project.north_star_metric
    if project.target_personas is not None:
        db_project.target_personas = project.target_personas
    db_project.color = project.color
    if project.attributes is not None:
        db_project.attributes = _merge_attributes(db_project.attributes or {}, project.attributes)
    db_project.website_url = normalized_url
    db.commit()
    db.refresh(db_project)

    if normalized_url != previous_url:
        if normalized_url:
            try:
                ingest_project_website(db, db_project, user_id)
            except Exception as exc:  # pragma: no cover - network best-effort
                logger.warning("Failed to refresh website context for project %s: %s", db_project.id, exc)
        else:
            clear_project_website_research(db, db_project, previous_url)

    return {"id": db_project.id, "project": {
        "title": db_project.title,
        "description": db_project.description,
        "goals": db_project.goals,
        "north_star_metric": db_project.north_star_metric,
        "target_personas": db_project.target_personas,
        "color": db_project.color,
        "attributes": db_project.attributes or {},
        "workspace_id": db_project.workspace_id,
        "website_url": db_project.website_url,
    }}


# Delete project
@app.delete("/projects/{project_id}")
def delete_project(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="owner")
    query = db.query(Project).filter(Project.id == project_id, Project.workspace_id == workspace_id)
    db_project = query.first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()

    return {"id": project_id, "deleted": True}


# -----------------------------
# Include Feature Routers
# -----------------------------
app.include_router(roadmap_ai.router)
app.include_router(roadmap_ai.workspace_router)
app.include_router(comments.router)
app.include_router(search.router)
app.include_router(prototypes.router)
app.include_router(links.router)
app.include_router(prototype_agent.router)
app.include_router(prd.router)
app.include_router(prd.workspace_router)
app.include_router(prd.embeddings_router)
app.include_router(agent.router)
app.include_router(knowledge_base.router)
app.include_router(roadmap_chat.router)
app.include_router(roadmap_context.router)
app.include_router(roadmap.router)
app.include_router(roadmap_phases.router)
app.include_router(workspace_memory.router)
app.include_router(workspace_agents.router)
app.include_router(workspace_agents.templates_router)
app.include_router(builder.router)
app.include_router(dashboard.router)
app.include_router(tasks.workspace_router)
app.include_router(tasks.task_router)
app.include_router(tasks_ai.router)
app.include_router(task_boards.workspace_router)
app.include_router(task_boards.board_router)
app.include_router(project_members.router)
app.include_router(templates.router)
app.include_router(mcp_connections.router)
app.include_router(strategy.router)
app.include_router(workspace_ai.router)
app.include_router(payments.router)
app.include_router(onboarding.router)
app.include_router(usage.router)
app.include_router(workspaces_router)
app.include_router(user_workspaces_router)
app.include_router(auth.router)
