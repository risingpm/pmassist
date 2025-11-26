from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas


def collect_dashboard_metrics(db: Session, workspace_id: UUID) -> Dict[str, Any]:
    """Aggregate workspace data used by both the dashboard and AI coach."""
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
