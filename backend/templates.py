from __future__ import annotations

from typing import Iterable
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from backend import models, schemas
from backend.database import get_db
from backend.rbac import ensure_membership, role_allows
from backend.template_service import get_accessible_template, get_latest_version, get_template_version

router = APIRouter(prefix="/workspaces/{workspace_id}/templates", tags=["templates"])

DEFAULT_SYSTEM_TEMPLATES: list[dict[str, object]] = [
    {
        "title": "PM Assist • Lean MVP PRD",
        "category": "PRD",
        "description": "Concise PRD focused on problem framing, assumptions, and MVP release criteria.",
        "tags": ["prd", "lean", "mvp"],
        "content": """# Objective
- What customer problem are we solving?
- Why now?

## Success Metrics
- Leading metric
- Adoption metric
- Guardrail metric

## Assumptions & Risks
- Assumption
- Risk

## MVP Scope
- User story
- Platform impact

## Release Readiness
- Launch checklist
- Support plan
""",
    },
    {
        "title": "PM Assist • AI Feature PRD",
        "category": "PRD",
        "description": "Template optimized for AI-driven features with model, data, and evaluation sections.",
        "tags": ["prd", "ai", "ml"],
        "content": """# Opportunity
- Problem statement
- Context links

## Personas & Jobs
- Persona
- Job-to-be-done

## AI Solution Overview
- Model / technique
- Data sources
- Offline vs realtime needs

## Experience Flow
1. Step
2. Step

## Evaluation Plan
- Offline metrics
- Online metrics / A/B

## Safeguards
- Bias checks
- Fallback behavior

## Open Questions
- Question
""",
    },
    {
        "title": "PM Assist • Enterprise PRD",
        "category": "PRD",
        "description": "Full PRD for enterprise launches covering compliance, rollout, and GTM.",
        "tags": ["prd", "enterprise", "launch"],
        "content": """# Summary
- Problem
- Target customer

## Goals & Non-Goals
- Goal
- Non-goal

## Detailed Requirements
- Functional requirement
- Non-functional requirement

## Dependencies
- Team / system

## Rollout & Enablement
- Beta plan
- GA criteria
- Support / docs

## Compliance & Security
- Data classification
- Regulatory notes

## Appendix
- Links
- Prior art
""",
    },
    {
        "title": "PM Assist • Outcome Roadmap",
        "category": "Roadmap",
        "description": "Sequence initiatives around measurable customer and business outcomes.",
        "tags": ["roadmap", "outcomes", "strategy"],
        "content": """# North Star
- What customer value or KPI anchors this roadmap?

## Outcome 1 (0-3 months)
- Problem it addresses
- Success metric / target
- Key bets or releases

## Outcome 2 (3-6 months)
- Problem it addresses
- Success metric / target
- Key bets or releases

## Outcome 3 (6-12 months)
- Problem it addresses
- Success metric / target
- Key bets or releases

## Risks & Assumptions
- Risk/assumption
""",
    },
    {
        "title": "PM Assist • Theme Roadmap",
        "category": "Roadmap",
        "description": "Roadmap organized into strategic themes with linked initiatives and KPIs.",
        "tags": ["roadmap", "themes", "planning"],
        "content": """# Strategic Pillars
- Pillar
- Why it matters now

## Theme 1
- Objective
- Core initiatives
- Impact metric
- Dependencies

## Theme 2
- Objective
- Core initiatives
- Impact metric
- Dependencies

## Theme 3
- Objective
- Core initiatives
- Impact metric
- Dependencies

## Notes
- Alignment callouts or guardrails
""",
    },
    {
        "title": "PM Assist • Platform Investment Roadmap",
        "category": "Roadmap",
        "description": "Plan foundational workstreams across experience, data, and infrastructure tracks.",
        "tags": ["roadmap", "platform", "engineering"],
        "content": """# Vision
- Long-term capability unlocked by these investments

## Experience Track
- Customer problem or workflow
- Key milestones
- Launch criteria

## Data & Intelligence Track
- Data quality / coverage goals
- Models or services to ship
- Measurement plan

## Infrastructure Track
- Reliability / scalability targets
- Core migrations or refactors
- Rollout considerations

## Cross-Team Alignment
- Partner teams
- Decision / review cadence
""",
    },
]


def _normalize_tags(values: Iterable[str] | None) -> list[str]:
    if not values:
        return []
    normalized = []
    seen = set()
    for value in values:
        cleaned = value.strip().lower()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)
    return normalized


def _serialize_version(version: models.TemplateVersion) -> schemas.TemplateVersionResponse:
    return schemas.TemplateVersionResponse(
        id=version.id,
        template_id=version.template_id,
        version_number=version.version_number,
        content=version.content,
        content_format=version.content_format,  # type: ignore[arg-type]
        metadata=version.content_metadata,
        created_by=version.created_by,
        created_at=version.created_at,
    )


def _serialize_template(template: models.Template, *, include_versions: bool = False) -> schemas.TemplateResponse:
    latest_version = get_latest_version(template)
    payload: dict[str, object] = {
        "id": template.id,
        "workspace_id": template.workspace_id,
        "title": template.title,
        "description": template.description,
        "category": template.category,
        "visibility": template.visibility,  # type: ignore[arg-type]
        "tags": template.tags or [],
        "version": template.version,
        "is_recommended": bool(template.is_recommended),
        "recommended_reason": template.recommended_reason,
        "created_by": template.created_by,
        "updated_by": template.updated_by,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "latest_version": _serialize_version(latest_version),
    }
    base = schemas.TemplateResponse(**payload)
    if include_versions:
        versions = [_serialize_version(version) for version in template.versions]
        return schemas.TemplateDetailResponse(**base.model_dump(), versions=versions)
    return base


def _assert_visibility_permission(role: str, visibility: str) -> None:
    if visibility == "system":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System templates are managed by PM Assist.")
    required = "editor" if visibility == "private" else "admin"
    if not role_allows(role, required):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to manage this template.")


@router.get("", response_model=list[schemas.TemplateResponse])
def list_templates(
    workspace_id: UUID,
    user_id: UUID,
    category: str | None = Query(default=None),
    visibility: schemas.TemplateVisibilityLiteral | None = Query(default=None),
    tag: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, le=200),
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    _ensure_system_templates(db)

    query = (
        db.query(models.Template)
        .options(sa.orm.selectinload(models.Template.versions))
        .filter(
            sa.or_(
                models.Template.visibility == "system",
                models.Template.workspace_id == workspace_id,
            )
        )
    )
    if category:
        query = query.filter(sa.func.lower(models.Template.category) == category.strip().lower())
    if visibility:
        if visibility == "system":
            query = query.filter(models.Template.visibility == "system")
        else:
            query = query.filter(models.Template.visibility == visibility)
    if tag:
        query = query.filter(models.Template.tags.contains([tag.strip().lower()]))
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            sa.or_(
                sa.func.lower(models.Template.title).like(like),
                sa.func.lower(models.Template.description).like(like),
            )
        )
    templates = (
        query.order_by(models.Template.is_recommended.desc(), models.Template.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_template(template) for template in templates]


@router.get("/{template_id}", response_model=schemas.TemplateDetailResponse)
def get_template_detail(workspace_id: UUID, template_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    template = get_accessible_template(db, workspace_id, template_id)
    return _serialize_template(template, include_versions=True)


@router.post("", response_model=schemas.TemplateDetailResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    workspace_id: UUID,
    payload: schemas.TemplateCreate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")
    _assert_visibility_permission(perm.role, payload.visibility)

    template = models.Template(
        workspace_id=workspace_id,
        title=payload.title.strip(),
        description=payload.description,
        category=(payload.category or "").strip() or None,
        visibility=payload.visibility,
        tags=_normalize_tags(payload.tags),
        version=1,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(template)
    db.flush()

    version = models.TemplateVersion(
        template_id=template.id,
        version_number=1,
        content=payload.content,
        content_format=payload.content_format,
        content_metadata=payload.metadata,
        created_by=user_id,
    )
    db.add(version)
    db.commit()
    db.refresh(template)
    return _serialize_template(template, include_versions=True)


@router.put("/{template_id}", response_model=schemas.TemplateDetailResponse)
def update_template(
    workspace_id: UUID,
    template_id: UUID,
    payload: schemas.TemplateUpdate,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")
    template = get_accessible_template(db, workspace_id, template_id)
    _assert_visibility_permission(perm.role, template.visibility)

    if payload.visibility and payload.visibility != template.visibility:
        _assert_visibility_permission(perm.role, payload.visibility)
        template.visibility = payload.visibility

    if payload.title:
        template.title = payload.title.strip()
    if payload.description is not None:
        template.description = payload.description
    if payload.category is not None:
        template.category = payload.category.strip() or None
    if payload.tags is not None:
        template.tags = _normalize_tags(payload.tags)

    created_version = None
    if payload.content:
        template.version += 1
        created_version = models.TemplateVersion(
            template_id=template.id,
            version_number=template.version,
            content=payload.content,
            content_format=payload.content_format or "markdown",
            content_metadata=payload.metadata,
            created_by=user_id,
        )
        db.add(created_version)
    template.updated_by = user_id
    db.add(template)
    db.commit()
    db.refresh(template)
    return _serialize_template(template, include_versions=True)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(workspace_id: UUID, template_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")
    template = get_accessible_template(db, workspace_id, template_id)
    _assert_visibility_permission(perm.role, template.visibility)
    db.delete(template)
    db.commit()


@router.post("/{template_id}/fork", response_model=schemas.TemplateDetailResponse, status_code=status.HTTP_201_CREATED)
def fork_template(
    workspace_id: UUID,
    template_id: UUID,
    user_id: UUID,
    payload: schemas.TemplateForkRequest | None = None,
    db: Session = Depends(get_db),
):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")
    template = get_accessible_template(db, workspace_id, template_id)
    latest_version = get_latest_version(template)

    desired_visibility = payload.visibility if payload and payload.visibility else "private"
    _assert_visibility_permission(perm.role, desired_visibility)

    forked = models.Template(
        workspace_id=workspace_id,
        title=payload.title.strip() if payload and payload.title else f"{template.title} Copy",
        description=template.description,
        category=template.category,
        visibility=desired_visibility,
        tags=list(template.tags or []),
        version=1,
        created_by=user_id,
        updated_by=user_id,
    )
    db.add(forked)
    db.flush()

    forked_version = models.TemplateVersion(
        template_id=forked.id,
        version_number=1,
        content=latest_version.content,
        content_format=latest_version.content_format,
        content_metadata=latest_version.content_metadata,
        created_by=user_id,
    )
    db.add(forked_version)
    db.commit()
    db.refresh(forked)
    return _serialize_template(forked, include_versions=True)


@router.get("/{template_id}/versions", response_model=list[schemas.TemplateVersionResponse])
def list_versions(workspace_id: UUID, template_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    template = get_accessible_template(db, workspace_id, template_id)
    return [_serialize_version(version) for version in template.versions]


@router.post("/{template_id}/versions/{version_number}/rollback", response_model=schemas.TemplateDetailResponse)
def rollback_template(
    workspace_id: UUID,
    template_id: UUID,
    version_number: int,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")
    template, version = get_template_version(db, workspace_id, template_id, version_number)
    _assert_visibility_permission(perm.role, template.visibility)

    template.version += 1
    rollback_version = models.TemplateVersion(
        template_id=template.id,
        version_number=template.version,
        content=version.content,
        content_format=version.content_format,
        content_metadata=version.content_metadata,
        created_by=user_id,
    )
    db.add(rollback_version)
    template.updated_by = user_id
    db.add(template)
    db.commit()
    db.refresh(template)
    return _serialize_template(template, include_versions=True)


@router.get("/{template_id}/apply", response_model=schemas.TemplateApplyResponse)
def apply_template(workspace_id: UUID, template_id: UUID, user_id: UUID, version: int | None = Query(default=None), db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    template, template_version = get_template_version(db, workspace_id, template_id, version)
    serialized = _serialize_template(template)
    return schemas.TemplateApplyResponse(template=serialized, version=_serialize_version(template_version))


def _ensure_system_templates(db: Session) -> None:
    existing = {
        title
        for title, in db.query(models.Template.title)
        .filter(models.Template.visibility == "system")
        .all()
    }
    created = False
    for template in DEFAULT_SYSTEM_TEMPLATES:
        title = template["title"]
        if title in existing:
            continue
        tmpl = models.Template(
            workspace_id=None,
            title=title,
            description=template["description"],
            category=template["category"],
            visibility="system",
            tags=template["tags"],
            version=1,
            is_recommended=True,
            created_by=None,
            updated_by=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(tmpl)
        db.flush()
        version = models.TemplateVersion(
            template_id=tmpl.id,
            version_number=1,
            content=template["content"],
            content_format="markdown",
            created_at=datetime.utcnow(),
        )
        db.add(version)
        created = True
    if created:
        db.commit()
