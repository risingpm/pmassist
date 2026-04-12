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


def _project_last_updated(project: models.Project) -> datetime | None:
    timestamps: list[datetime] = [value for value in [project.created_at] if value is not None]
    timestamps.extend(prd.updated_at or prd.created_at for prd in project.prds if (prd.updated_at or prd.created_at))
    timestamps.extend(task.updated_at or task.created_at for task in project.tasks if (task.updated_at or task.created_at))
    timestamps.extend(
        roadmap.updated_at or roadmap.created_at for roadmap in project.roadmaps if (roadmap.updated_at or roadmap.created_at)
    )
    return max(timestamps) if timestamps else None


def _project_progress(project: models.Project) -> int:
    task_total = len(project.tasks)
    if task_total:
        done_tasks = sum(1 for task in project.tasks if (task.status or "").lower() == "done")
        return max(8, min(96, int(round((done_tasks / task_total) * 100))))
    prd_total = len(project.prds)
    if prd_total:
        return max(20, min(92, prd_total * 18))
    roadmap_total = len(project.roadmaps)
    if roadmap_total:
        return max(18, min(90, roadmap_total * 22))
    return 12


def _project_meta(project: models.Project) -> str:
    prd_total = len(project.prds)
    task_total = len(project.tasks)
    if prd_total or task_total:
        return f"{prd_total} PRD{'s' if prd_total != 1 else ''} • {task_total} task{'s' if task_total != 1 else ''}"
    return "No linked deliverables yet"


def collect_dashboard_home(db: Session, workspace_id: UUID) -> Dict[str, Any]:
    metrics = collect_dashboard_metrics(db, workspace_id)
    now = datetime.now(timezone.utc)

    projects = (
        db.query(models.Project)
        .filter(models.Project.workspace_id == workspace_id)
        .all()
    )
    project_rows = []
    for project in projects:
        updated_at = _project_last_updated(project)
        project_rows.append(
            {
                "id": project.id,
                "title": project.title or "Untitled project",
                "description": project.description or project.goals or None,
                "meta": _project_meta(project),
                "progress_percent": _project_progress(project),
                "color": project.color,
                "last_updated": updated_at,
            }
        )
    project_rows.sort(key=lambda item: item["last_updated"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    active_projects = project_rows[:3]

    latest_prds = (
        db.query(models.PRD)
        .filter(models.PRD.workspace_id == workspace_id)
        .order_by(models.PRD.updated_at.desc().nullslast(), models.PRD.created_at.desc().nullslast())
        .limit(3)
        .all()
    )
    latest_roadmaps = (
        db.query(models.Roadmap)
        .filter(models.Roadmap.workspace_id == workspace_id)
        .order_by(models.Roadmap.updated_at.desc().nullslast(), models.Roadmap.created_at.desc().nullslast())
        .limit(1)
        .all()
    )
    latest_tasks = (
        db.query(models.Task)
        .filter(models.Task.workspace_id == workspace_id)
        .order_by(models.Task.updated_at.desc().nullslast(), models.Task.created_at.desc().nullslast())
        .limit(2)
        .all()
    )

    recent_activity: list[dict[str, Any]] = []
    for prd in latest_prds:
        updated_at = prd.updated_at or prd.created_at or now
        recent_activity.append(
            {
                "id": f"prd-{prd.id}",
                "title": prd.feature_name or (prd.project.title if prd.project else None) or "Untitled PRD",
                "meta": f"PRD • {updated_at.strftime('%b %d, %Y')}",
                "badge": "Saved" if prd.is_active else "Archived",
                "badge_tone": "green" if prd.is_active else "purple",
                "kind": "prd",
                "occurred_at": updated_at,
            }
        )
    for roadmap in latest_roadmaps:
        updated_at = roadmap.updated_at or roadmap.created_at or now
        title = roadmap.project.title if roadmap.project and roadmap.project.title else "Workspace roadmap"
        recent_activity.append(
            {
                "id": f"roadmap-{roadmap.id}",
                "title": title,
                "meta": f"Roadmap • {updated_at.strftime('%b %d, %Y')}",
                "badge": "Updated",
                "badge_tone": "blue",
                "kind": "roadmap",
                "occurred_at": updated_at,
            }
        )
    for task in latest_tasks:
        updated_at = task.updated_at or task.created_at or now
        status = (task.status or "todo").replace("_", " ")
        recent_activity.append(
            {
                "id": f"task-{task.id}",
                "title": task.title,
                "meta": f"Task • {updated_at.strftime('%b %d, %Y')}",
                "badge": status.title(),
                "badge_tone": "amber" if task.status == "in_progress" else "green" if task.status == "done" else "purple",
                "kind": "task",
                "occurred_at": updated_at,
            }
        )
    recent_activity.sort(key=lambda item: item["occurred_at"], reverse=True)

    upcoming_items: list[dict[str, Any]] = []
    upcoming_tasks = (
        db.query(models.Task)
        .filter(
            models.Task.workspace_id == workspace_id,
            models.Task.due_date.isnot(None),
            models.Task.due_date >= now,
        )
        .order_by(models.Task.due_date.asc())
        .limit(3)
        .all()
    )
    for task in upcoming_tasks:
        progress = _project_progress(task.project) if task.project else 0
        due_label = task.due_date.strftime("%b %d, %Y") if task.due_date else "Upcoming"
        upcoming_items.append(
            {
                "id": f"task-{task.id}",
                "title": task.title,
                "description": f"Due {due_label}",
                "progress_percent": progress,
            }
        )
    if not upcoming_items:
        for project in active_projects[:3]:
            last_updated = project["last_updated"]
            description = (
                f"Updated {last_updated.strftime('%b %d, %Y')}" if isinstance(last_updated, datetime) else "Recently updated"
            )
            upcoming_items.append(
                {
                    "id": f"project-{project['id']}",
                    "title": project["title"],
                    "description": description,
                    "progress_percent": project["progress_percent"],
                }
            )

    team_memberships = (
        db.query(models.WorkspaceMember)
        .filter(models.WorkspaceMember.workspace_id == workspace_id)
        .order_by(models.WorkspaceMember.created_at.asc())
        .limit(4)
        .all()
    )
    team = [
        {
            "id": membership.id,
            "user_id": membership.user_id,
            "email": membership.user.email if membership.user and membership.user.email else "",
            "display_name": (
                membership.user.display_name if membership.user and membership.user.display_name else membership.user.email
            )
            or "Workspace member",
            "role": (membership.role or "viewer").lower(),
        }
        for membership in team_memberships
    ]

    ai_automations = (
        db.query(func.count(models.AIAgent.id))
        .filter(models.AIAgent.workspace_id == workspace_id)
        .scalar()
        or 0
    )

    return {
        "metrics": schemas.DashboardOverviewResponse(**metrics),
        "ai_automations": int(ai_automations),
        "active_projects": [schemas.DashboardProjectSummary(**project) for project in active_projects],
        "recent_activity": [schemas.DashboardActivityItem(**item) for item in recent_activity[:5]],
        "upcoming": [schemas.DashboardUpcomingItem(**item) for item in upcoming_items[:3]],
        "team": [schemas.DashboardTeamMember(**member) for member in team],
    }
