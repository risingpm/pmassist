from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client
from backend.dashboard_service import collect_dashboard_metrics
from backend.database import get_db
from backend.rbac import ensure_project_access

router = APIRouter(prefix="/strategy", tags=["strategy"])


def _get_project(db: Session, project_id: UUID) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _serialize_pillars(records: list[models.StrategicPillar]) -> list[schemas.StrategicPillar]:
    return [
        schemas.StrategicPillar(
            id=record.id,
            title=record.title,
            description=record.description or "",
            progress_percent=float(record.progress_percent or 0.0),
            related_prds=record.related_prds or [],
            related_roadmaps=record.related_roadmaps or [],
            related_tasks=record.related_tasks or [],
        )
        for record in records
    ]


def _serialize_insights(records: list[models.StrategicInsight]) -> list[schemas.StrategicInsight]:
    return [
        schemas.StrategicInsight(
            id=record.id,
            title=record.title,
            description=record.description,
            severity=record.severity,
            source_type=record.source_type,
            source_id=record.source_id,
            suggested_action=record.suggested_action,
            impact_score=record.impact_score,
        )
        for record in records
    ]


def _summarize_snapshot(snapshot: models.StrategicSnapshot | None) -> schemas.StrategySummary:
    if not snapshot:
        return schemas.StrategySummary(
            narrative="Strategic summary unavailable.",
            focus_areas=[],
            forecast="",
            health_score=0.0,
        )
    return schemas.StrategySummary(
        narrative=snapshot.summary or "",
        focus_areas=snapshot.focus_areas or [],
        forecast=snapshot.forecast or "",
        health_score=snapshot.health_score,
    )


def _pull_project_context(db: Session, project: models.Project) -> dict[str, Any]:
    prds = (
        db.query(models.PRD)
        .filter(models.PRD.project_id == project.id)
        .order_by(models.PRD.updated_at.desc().nullslast())
        .limit(20)
        .all()
    )
    tasks = (
        db.query(models.Task)
        .filter(models.Task.project_id == project.id)
        .order_by(models.Task.updated_at.desc().nullslast())
        .limit(50)
        .all()
    )
    roadmaps = (
        db.query(models.Roadmap)
        .filter(models.Roadmap.project_id == project.id)
        .order_by(models.Roadmap.updated_at.desc().nullslast())
        .limit(5)
        .all()
    )

    return {
        "project": {
            "id": str(project.id),
            "title": project.title,
            "goals": project.goals,
            "north_star_metric": project.north_star_metric,
        },
        "prds": [
            {
                "id": str(prd.id),
                "title": prd.feature_name or "PRD",
                "goals": prd.goals,
                "content": prd.content,
                "updated_at": (prd.updated_at or prd.created_at).isoformat() if prd.updated_at or prd.created_at else None,
            }
            for prd in prds
        ],
        "tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "description": task.description,
                "due_date": task.due_date.isoformat() if task.due_date else None,
            }
            for task in tasks
        ],
        "roadmaps": [
            {
                "id": str(roadmap.id),
                "title": getattr(roadmap, "title", None) or f"{project.title} Roadmap",
                "content": roadmap.content,
                "updated_at": (roadmap.updated_at or roadmap.created_at).isoformat() if roadmap.updated_at or roadmap.created_at else None,
            }
            for roadmap in roadmaps
        ],
    }


def _build_strategy_prompt(metrics: dict[str, Any], context: dict[str, Any]) -> str:
    return (
        "You are the AI Product Strategist (AI CPO) for this project. Analyze the provided context and respond with JSON"
        ' matching {"summary":{"narrative":"","focus_areas":[],"forecast":"","health_score":0.0},'
        '"pillars":[{"title":"","description":"","progress_percent":0.0,'
        '"related_prds":[{"id":"","title":""}],"related_roadmaps":[{"id":"","title":""}],'
        '"related_tasks":[{"id":"","title":"","status":""}]}],'
        '"insights":[{"title":"","description":"","severity":"info|warning|risk",'
        '"source_type":"prd|roadmap|task","source_id":"","suggested_action":"","impact_score":0.0}]}.'
        "Focus on clustering PRDs, roadmaps, and tasks into strategic pillars, highlight overlaps, and forecast outcomes."
        f"\nWorkspace metrics: {json.dumps(metrics, default=str)}"
        f"\nProject context: {json.dumps(context, default=str)}"
    )


def _store_strategy(db: Session, workspace_id: UUID, project_id: UUID, payload: dict[str, Any]) -> tuple[list[models.StrategicPillar], list[models.StrategicInsight], models.StrategicSnapshot]:
    db.query(models.StrategicPillar).filter(
        models.StrategicPillar.workspace_id == workspace_id,
        models.StrategicPillar.project_id == project_id,
    ).delete()
    db.query(models.StrategicInsight).filter(
        models.StrategicInsight.workspace_id == workspace_id,
        models.StrategicInsight.project_id == project_id,
    ).delete()
    db.commit()

    pillars: list[models.StrategicPillar] = []
    for entry in payload.get("pillars", []) or []:
        record = models.StrategicPillar(
            workspace_id=workspace_id,
            project_id=project_id,
            title=entry.get("title") or "Strategic Pillar",
            description=entry.get("description"),
            progress_percent=float(entry.get("progress_percent") or 0.0),
            related_prds=entry.get("related_prds") or [],
            related_roadmaps=entry.get("related_roadmaps") or [],
            related_tasks=entry.get("related_tasks") or [],
        )
        db.add(record)
        pillars.append(record)

    insights: list[models.StrategicInsight] = []
    for entry in payload.get("insights", []) or []:
        record = models.StrategicInsight(
            workspace_id=workspace_id,
            project_id=project_id,
            title=entry.get("title") or "Insight",
            description=entry.get("description") or "",
            severity=entry.get("severity"),
            source_type=entry.get("source_type"),
            source_id=entry.get("source_id"),
            suggested_action=entry.get("suggested_action"),
            impact_score=entry.get("impact_score"),
        )
        db.add(record)
        insights.append(record)

    db.commit()

    summary_payload = payload.get("summary") or {}
    snapshot = (
        db.query(models.StrategicSnapshot)
        .filter(
            models.StrategicSnapshot.workspace_id == workspace_id,
            models.StrategicSnapshot.project_id == project_id,
        )
        .first()
    )
    if not snapshot:
        snapshot = models.StrategicSnapshot(workspace_id=workspace_id, project_id=project_id)
    snapshot.summary = summary_payload.get("narrative") or ""
    snapshot.focus_areas = summary_payload.get("focus_areas") or []
    snapshot.forecast = summary_payload.get("forecast") or ""
    snapshot.health_score = summary_payload.get("health_score")
    snapshot.generated_at = datetime.now(timezone.utc)
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    return pillars, insights, snapshot


def _build_overview_response(
    pillars: list[models.StrategicPillar],
    insights: list[models.StrategicInsight],
    snapshot: models.StrategicSnapshot | None,
) -> schemas.StrategyOverviewResponse:
    latest_time = snapshot.generated_at if snapshot else datetime.now(timezone.utc)
    return schemas.StrategyOverviewResponse(
        pillars=_serialize_pillars(pillars),
        insights=_serialize_insights(insights),
        summary=_summarize_snapshot(snapshot),
        updated_at=latest_time,
    )


def _get_cached_strategy(db: Session, workspace_id: UUID, project_id: UUID):
    pillars = (
        db.query(models.StrategicPillar)
        .filter(
            models.StrategicPillar.workspace_id == workspace_id,
            models.StrategicPillar.project_id == project_id,
        )
        .order_by(models.StrategicPillar.generated_at.desc())
        .all()
    )
    insights = (
        db.query(models.StrategicInsight)
        .filter(
            models.StrategicInsight.workspace_id == workspace_id,
            models.StrategicInsight.project_id == project_id,
        )
        .order_by(models.StrategicInsight.generated_at.desc())
        .limit(20)
        .all()
    )
    snapshot = (
        db.query(models.StrategicSnapshot)
        .filter(
            models.StrategicSnapshot.workspace_id == workspace_id,
            models.StrategicSnapshot.project_id == project_id,
        )
        .first()
    )
    return pillars, insights, snapshot


def _generate_strategy(db: Session, workspace_id: UUID, project_id: UUID, user_id: UUID) -> schemas.StrategyOverviewResponse:
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")
    project = _get_project(db, project_id)
    if project.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project does not belong to workspace")

    metrics = collect_dashboard_metrics(db, workspace_id)
    context = _pull_project_context(db, project)
    prompt = _build_strategy_prompt(metrics, context)

    data: dict[str, Any]
    try:
        client = get_openai_client(db, workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "You are an AI CPO. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or "{}"
        data = json.loads(content)
    except Exception:
        data = {
            "summary": {
                "narrative": "Strategic data unavailable.",
                "focus_areas": [],
                "forecast": "",
                "health_score": 0.5,
            },
            "pillars": [
                {
                    "title": "Execution",
                    "description": "Default strategic pillar.",
                    "progress_percent": 0.0,
                    "related_prds": [],
                    "related_roadmaps": [],
                    "related_tasks": [],
                }
            ],
            "insights": [
                {
                    "title": "Monitor roadmap",
                    "description": "Unable to generate insights; verify AI credentials.",
                    "severity": "info",
                    "suggested_action": "Regenerate once AI access is available.",
                }
            ],
        }

    pillars, insights, snapshot = _store_strategy(db, workspace_id, project_id, data)
    return _build_overview_response(pillars, insights, snapshot)


@router.get("/projects/{project_id}", response_model=schemas.StrategyOverviewResponse)
def get_project_strategy(
    project_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    force_refresh: bool = False,
    db: Session = Depends(get_db),
):
    project = _get_project(db, project_id)
    if project.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project/workspace mismatch")
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="viewer")

    if force_refresh:
        return _generate_strategy(db, workspace_id, project_id, user_id)

    pillars, insights, snapshot = _get_cached_strategy(db, workspace_id, project_id)
    if snapshot and snapshot.generated_at >= datetime.now(timezone.utc) - timedelta(hours=6):
        return _build_overview_response(pillars, insights, snapshot)
    return _generate_strategy(db, workspace_id, project_id, user_id)


@router.post("/projects/{project_id}/regenerate", response_model=schemas.StrategyOverviewResponse)
def regenerate_project_strategy(
    project_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, project_id, user_id, required_role="contributor")
    return _generate_strategy(db, workspace_id, project_id, user_id)


@router.post("/projects/{project_id}/ask", response_model=schemas.StrategyAskResponse)
def ask_project_strategist(
    project_id: UUID,
    payload: schemas.StrategyAskRequest,
    db: Session = Depends(get_db),
):
    project = _get_project(db, project_id)
    if project.workspace_id != payload.workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project/workspace mismatch")
    ensure_project_access(db, payload.workspace_id, project_id, payload.user_id, required_role="viewer")

    pillars, insights, snapshot = _get_cached_strategy(db, payload.workspace_id, project_id)
    if not snapshot:
        overview = _generate_strategy(db, payload.workspace_id, project_id, payload.user_id)
        pillars = []
        insights = []
        summary = overview.summary
    else:
        summary = _summarize_snapshot(snapshot)

    context_payload = {
        "pillars": [pillar.dict() for pillar in _serialize_pillars(pillars)],
        "insights": [insight.dict() for insight in _serialize_insights(insights)],
        "summary": summary.model_dump(),
    }

    prompt = (
        "You are the AI Product Strategist for this project. Answer concisely based on context."
        f"\nContext: {json.dumps(context_payload, default=str)}\nQuestion: {payload.question}"
    )
    answer = "I'm analyzing your project. Please try again soon."
    try:
        client = get_openai_client(db, payload.workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {"role": "system", "content": "You respond as an executive strategist."},
                {"role": "user", "content": prompt},
            ],
        )
        answer = completion.choices[0].message.content or answer
    except Exception:
        pass

    return schemas.StrategyAskResponse(answer=answer, context_used=context_payload)
