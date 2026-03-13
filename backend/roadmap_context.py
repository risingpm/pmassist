from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.database import get_db
from backend.knowledge_base_service import ensure_workspace_kb, update_entry_embedding
from backend.rbac import ensure_membership

router = APIRouter(prefix="/roadmaps", tags=["roadmap"])


def _normalize_tag(tag: str) -> str:
    return tag.strip().lower()


def _serialize_entry(entry: models.KnowledgeBaseEntry) -> schemas.KnowledgeBaseEntryResponse:
    file_url = None
    if entry.file_path:
        file_url = f"/knowledge-base/entries/{entry.id}/download"
    return schemas.KnowledgeBaseEntryResponse(
        id=entry.id,
        kb_id=entry.kb_id,
        type=entry.type,
        title=entry.title,
        content=entry.content,
        file_url=file_url,
        source_url=entry.source_url,
        created_by=entry.created_by,
        created_by_email=entry.creator.email if entry.creator else None,
        project_id=entry.project_id,
        tags=entry.tags or [],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _project_context_content(project: models.Project) -> str:
    parts: list[str] = []
    if project.description:
        parts.append(f"Description: {project.description}")
    if project.goals:
        parts.append(f"Goals: {project.goals}")
    if project.north_star_metric:
        parts.append(f"North star metric: {project.north_star_metric}")
    if project.target_personas:
        parts.append(f"Target personas: {', '.join(project.target_personas)}")
    return "\n".join(parts) or "Project context linked."


def _prd_context_content(prd: models.PRD) -> str:
    parts: list[str] = []
    if prd.feature_name:
        parts.append(f"Feature: {prd.feature_name}")
    if prd.description:
        parts.append(f"Description: {prd.description}")
    if prd.goals:
        parts.append(f"Goals: {prd.goals}")
    if prd.content:
        snippet = prd.content.strip()
        if len(snippet) > 1200:
            snippet = snippet[:1200].rstrip() + "..."
        parts.append(f"Draft:\n{snippet}")
    return "\n".join(parts) or "PRD context linked."


@router.post("/context/link", response_model=list[schemas.KnowledgeBaseEntryResponse])
def link_roadmap_context(
    payload: schemas.RoadmapContextLinkRequest,
    db: Session = Depends(get_db),
):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="editor")
    context_tag = _normalize_tag(payload.context_tag)
    if not context_tag:
        raise HTTPException(status_code=400, detail="context_tag is required")
    kb = ensure_workspace_kb(db, payload.workspace_id)

    created_entries: list[schemas.KnowledgeBaseEntryResponse] = []

    if payload.project_ids:
        projects = (
            db.query(models.Project)
            .filter(
                models.Project.workspace_id == payload.workspace_id,
                models.Project.id.in_(payload.project_ids),
            )
            .all()
        )
        for project in projects:
            project_tag = f"project:{project.id}"
            existing = (
                db.query(models.KnowledgeBaseEntry)
                .filter(
                    models.KnowledgeBaseEntry.kb_id == kb.id,
                    models.KnowledgeBaseEntry.tags.contains([context_tag]),
                    models.KnowledgeBaseEntry.tags.contains([_normalize_tag(project_tag)]),
                )
                .first()
            )
            if existing:
                created_entries.append(_serialize_entry(existing))
                continue
            entry = models.KnowledgeBaseEntry(
                kb_id=kb.id,
                type="roadmap",
                title=f"Project: {project.title}",
                content=_project_context_content(project),
                created_by=payload.user_id,
                project_id=project.id,
                tags=[
                    "roadmap",
                    "context",
                    "link",
                    context_tag,
                    _normalize_tag(project_tag),
                ],
            )
            db.add(entry)
            db.flush()
            update_entry_embedding(db, entry, workspace_id=payload.workspace_id)
            created_entries.append(_serialize_entry(entry))

    if payload.prd_ids:
        prds = (
            db.query(models.PRD)
            .filter(
                models.PRD.workspace_id == payload.workspace_id,
                models.PRD.id.in_(payload.prd_ids),
            )
            .all()
        )
        for prd in prds:
            prd_tag = f"prd:{prd.id}"
            existing = (
                db.query(models.KnowledgeBaseEntry)
                .filter(
                    models.KnowledgeBaseEntry.kb_id == kb.id,
                    models.KnowledgeBaseEntry.tags.contains([context_tag]),
                    models.KnowledgeBaseEntry.tags.contains([_normalize_tag(prd_tag)]),
                )
                .first()
            )
            if existing:
                created_entries.append(_serialize_entry(existing))
                continue
            entry = models.KnowledgeBaseEntry(
                kb_id=kb.id,
                type="prd",
                title=prd.feature_name or "PRD",
                content=_prd_context_content(prd),
                created_by=payload.user_id,
                project_id=prd.project_id,
                tags=[
                    "roadmap",
                    "context",
                    "link",
                    context_tag,
                    _normalize_tag(prd_tag),
                ],
            )
            db.add(entry)
            db.flush()
            update_entry_embedding(db, entry, workspace_id=payload.workspace_id)
            created_entries.append(_serialize_entry(entry))

    if not created_entries:
        raise HTTPException(status_code=404, detail="No matching projects or PRDs found.")
    db.commit()
    return created_entries
