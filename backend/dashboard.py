from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client
from backend.database import get_db
from backend.knowledge_base_service import get_relevant_entries, build_entry_content
from backend.rbac import ensure_membership

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _coerce_status(value: str | None) -> str:
    if not value:
        return "draft"
    normalized = value.lower()
    if normalized in {"draft", "active", "shipped"}:
        return normalized
    return "active"


def _collect_metrics(db: Session, workspace_id: UUID) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    prds = (
        db.query(models.PRD)
        .filter(models.PRD.workspace_id == workspace_id)
        .order_by(models.PRD.updated_at.desc().nullslast())
        .limit(5)
        .all()
    )
    prd_items = [
        schemas.DashboardPRDItem(
            id=prd.id,
            title=prd.feature_name or prd.project.title if prd.project else prd.feature_name or "Untitled PRD",
            status="active" if prd.is_active else "archived",
            updated_at=prd.updated_at or prd.created_at,
        )
        for prd in prds
    ]

    task_counts = (
        db.query(models.Task.status, func.count(models.Task.id))
        .filter(models.Task.workspace_id == workspace_id)
        .group_by(models.Task.status)
        .all()
    )
    counts_map = {status: count for status, count in task_counts}
    todo = int(counts_map.get("todo", 0))
    in_progress = int(counts_map.get("in_progress", 0))
    done = int(counts_map.get("done", 0))
    total_tasks = todo + in_progress + done

    roadmap_tasks = (
        db.query(models.Task.status, func.count(models.Task.id))
        .filter(models.Task.workspace_id == workspace_id, models.Task.roadmap_id.isnot(None))
        .group_by(models.Task.status)
        .all()
    )
    roadmap_counts = {status: count for status, count in roadmap_tasks}
    roadmap_total = int(sum(roadmap_counts.values()))
    roadmap_done = int(roadmap_counts.get("done", 0))
    completion_percent = (
        (roadmap_done / roadmap_total) * 100 if roadmap_total > 0 else float(done / total_tasks * 100) if total_tasks else 0.0
    )

    latest_roadmap = (
        db.query(models.Roadmap)
        .filter(models.Roadmap.workspace_id == workspace_id, models.Roadmap.is_active == True)
        .order_by(models.Roadmap.updated_at.desc().nullslast())
        .first()
    )
    current_phase = None
    if latest_roadmap:
        content = latest_roadmap.content or ""
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                current_phase = stripped.lstrip("# ").strip()
                break

    completed_last_7 = (
        db.query(func.count(models.Task.id))
        .filter(
            models.Task.workspace_id == workspace_id,
            models.Task.status == "done",
            models.Task.updated_at >= seven_days_ago,
        )
        .scalar()
        or 0
    )

    velocity_trend: list[float] = []
    for days_back in range(6, -1, -1):
        day_start = now - timedelta(days=days_back + 1)
        day_end = now - timedelta(days=days_back)
        day_count = (
            db.query(func.count(models.Task.id))
            .filter(
                models.Task.workspace_id == workspace_id,
                models.Task.status == "done",
                models.Task.updated_at >= day_start,
                models.Task.updated_at < day_end,
            )
            .scalar()
            or 0
        )
        velocity_trend.append(float(day_count))

    sprint_velocity = float(completed_last_7 / 7) if completed_last_7 else 0.0

    return {
        "prds": prd_items,
        "roadmap": schemas.DashboardRoadmapSummary(
            current_phase=current_phase,
            completion_percent=round(completion_percent, 1),
            total_tasks=roadmap_total,
            done_tasks=roadmap_done,
        ),
        "tasks": schemas.DashboardTaskSummary(
            total=total_tasks,
            todo=todo,
            in_progress=in_progress,
            done=done,
        ),
        "sprint": schemas.DashboardSprintSummary(
            velocity=round(sprint_velocity, 2),
            completed_last_7_days=completed_last_7,
            velocity_trend=velocity_trend,
            updated_at=now,
        ),
        "updated_at": now,
    }


@router.get("/overview", response_model=schemas.DashboardOverviewResponse)
def get_dashboard_overview(workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    metrics = _collect_metrics(db, workspace_id)
    return schemas.DashboardOverviewResponse(**metrics)


def _coach_prompt(metrics: dict[str, Any], kb_entries: list[models.KnowledgeBaseEntry]) -> str:
    prd_lines = "\n".join(
        f"- {item.title} (status: {item.status}, updated {item.updated_at.strftime('%Y-%m-%d')})"
        for item in metrics["prds"]
    ) or "No active PRDs."

    context_snippets = []
    for entry in kb_entries:
        snippet = build_entry_content(entry, clip=200) or entry.content or ""
        context_snippets.append(f"{entry.title} [{entry.type}]: {snippet}")
    context_block = "\n".join(context_snippets) or "No additional knowledge-base context."

    roadmap = metrics["roadmap"]
    tasks = metrics["tasks"]
    sprint = metrics["sprint"]

    return (
        "You are an AI product operations coach. Analyze the workspace metrics and provide one paragraph summary "
        "plus 3 concise recommendations in JSON format like "
        '{"message": "...", "suggestions": ["..."], "confidence": 0.0}. '
        "Current workspace data:\n"
        f"Active PRDs:\n{prd_lines}\n\n"
        f"Roadmap: current phase={roadmap.current_phase}, completion={roadmap.completion_percent}% "
        f"(done {roadmap.done_tasks}/{roadmap.total_tasks}).\n"
        f"Tasks: total={tasks.total}, todo={tasks.todo}, in_progress={tasks.in_progress}, done={tasks.done}.\n"
        f"Sprint: velocity={sprint.velocity} tasks/day, completed last 7 days={sprint.completed_last_7_days}, "
        f"trend={sprint.velocity_trend}.\n"
        f"Context:\n{context_block}"
    )


@router.post("/coach", response_model=schemas.DashboardCoachResponse)
def get_dashboard_coach(payload: schemas.DashboardCoachRequest, db: Session = Depends(get_db)):
    ensure_membership(db, payload.workspace_id, payload.user_id, required_role="viewer")
    metrics = _collect_metrics(db, payload.workspace_id)
    kb_entries = get_relevant_entries(db, payload.workspace_id, "roadmap status", top_n=3)
    prompt = _coach_prompt(metrics, kb_entries)

    try:
        client = get_openai_client(db, payload.workspace_id)
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "Respond with JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        content = completion.choices[0].message.content or ""
        data = json.loads(content)
        message = data.get("message") or "Unable to generate insight."
        suggestions = data.get("suggestions") or []
        if not isinstance(suggestions, list):
            suggestions = [str(suggestions)]
        confidence = float(data.get("confidence") or 0.65)
    except Exception:
        message = "Roadmap execution looks steady, but continue monitoring sprint completion risk."
        suggestions = [
            "Review tasks that are still in progress to unblock dependencies.",
            "Confirm roadmap phase goals with the team.",
            "Capture learnings in the latest PRDs to keep context fresh.",
        ]
        confidence = 0.5

    return schemas.DashboardCoachResponse(
        message=message,
        suggestions=[str(item) for item in suggestions if str(item).strip()],
        confidence=confidence,
    )
