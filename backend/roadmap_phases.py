from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from backend import models, schemas
from backend.database import get_db
from backend.workspaces import get_project_in_workspace
from backend.rbac import ensure_project_access
from backend.ai_providers import get_openai_client

router = APIRouter(prefix="/projects/{project_id}/roadmap", tags=["roadmap"])


def _phase_scope(db: Session, project_id: str, workspace_id: UUID):
    project = get_project_in_workspace(db, project_id, workspace_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _milestone_progress(milestone: models.RoadmapMilestone) -> tuple[float, int, int]:
    total = 0
    completed = 0
    for link in milestone.task_links:
        if not link.task:
            continue
        total += 1
        if link.task.status == "done":
            completed += 1
    if total == 0:
        percent = 100.0 if milestone.status == "done" else 0.0
    else:
        percent = round((completed / total) * 100, 1)
    return percent, total, completed


def _linked_tasks(link: models.RoadmapMilestoneTask) -> schemas.RoadmapLinkedTask | None:
    task = link.task
    if not task:
        return None
    return schemas.RoadmapLinkedTask(
        id=task.id,
        title=task.title,
        status=task.status,  # type: ignore[arg-type]
        assignee_id=task.assignee_id,
        due_date=task.due_date,
        project_id=task.project_id,
    )


def _milestone_to_schema(milestone: models.RoadmapMilestone) -> schemas.RoadmapMilestoneResponse:
    percent, _, _ = _milestone_progress(milestone)
    linked = []
    for link in milestone.task_links:
        payload = _linked_tasks(link)
        if payload:
            linked.append(payload)
    linked.sort(key=lambda t: t.title.lower())
    return schemas.RoadmapMilestoneResponse(
        id=milestone.id,
        phase_id=milestone.phase_id,
        title=milestone.title,
        description=milestone.description,
        due_date=milestone.due_date,
        status=milestone.status,
        order_index=milestone.order_index,
        progress_percent=percent,
        linked_tasks=linked,
        ai_summary=milestone.ai_summary,
    )


def _phase_to_schema(phase: models.RoadmapPhase) -> schemas.RoadmapPhaseResponse:
    milestones = sorted(phase.milestones, key=lambda m: (m.order_index, m.created_at or datetime.now(timezone.utc)))
    milestone_payloads: list[schemas.RoadmapMilestoneResponse] = [_milestone_to_schema(item) for item in milestones]
    total = sum(len(m.linked_tasks) for m in milestones)
    completed = 0
    for milestone in milestones:
        _, _, comp = _milestone_progress(milestone)
        completed += comp
    progress = 0.0
    if total > 0:
        progress = round((completed / total) * 100, 1)
    elif all(m.status == "done" for m in milestones) and milestones:
        progress = 100.0
    return schemas.RoadmapPhaseResponse(
        id=phase.id,
        title=phase.title,
        description=phase.description,
        order_index=phase.order_index,
        status=phase.status,
        start_date=phase.start_date,
        due_date=phase.due_date,
        progress_percent=progress,
        milestones=milestone_payloads,
    )


def _phase_query(db: Session, project: models.Project):
    return (
        db.query(models.RoadmapPhase)
        .options(
            joinedload(models.RoadmapPhase.milestones)
            .joinedload(models.RoadmapMilestone.task_links)
            .joinedload(models.RoadmapMilestoneTask.task)
        )
        .filter(
            models.RoadmapPhase.project_id == project.id,
            models.RoadmapPhase.workspace_id == project.workspace_id,
        )
        .order_by(models.RoadmapPhase.order_index.asc(), models.RoadmapPhase.created_at.asc())
    )


@router.get("/phases", response_model=list[schemas.RoadmapPhaseResponse])
def list_roadmap_phases(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = _phase_scope(db, project_id, workspace_id)
    phases = _phase_query(db, project).all()
    return [_phase_to_schema(phase) for phase in phases]


@router.post("/phases", response_model=schemas.RoadmapPhaseResponse)
def create_roadmap_phase(
    project_id: str,
    payload: schemas.RoadmapPhaseCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    order_index = payload.order_index if payload.order_index is not None else (
        db.query(func.coalesce(func.max(models.RoadmapPhase.order_index), -1))
        .filter(
            models.RoadmapPhase.project_id == project.id,
            models.RoadmapPhase.workspace_id == project.workspace_id,
        )
        .scalar()
        + 1
    )
    record = models.RoadmapPhase(
        project_id=project.id,
        workspace_id=project.workspace_id,
        title=payload.title,
        description=payload.description,
        order_index=order_index,
        status=payload.status or "planned",
        start_date=payload.start_date,
        due_date=payload.due_date,
        created_by=user_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _phase_to_schema(record)


@router.put("/phases/{phase_id}", response_model=schemas.RoadmapPhaseResponse)
def update_roadmap_phase(
    project_id: str,
    phase_id: UUID,
    payload: schemas.RoadmapPhaseUpdate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    phase = (
        _phase_query(db, project)
        .filter(models.RoadmapPhase.id == phase_id)
        .first()
    )
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    for field in ["title", "description", "status", "start_date", "due_date"]:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(phase, field, value)
    if payload.order_index is not None:
        phase.order_index = payload.order_index
    db.commit()
    db.refresh(phase)
    return _phase_to_schema(phase)


@router.delete("/phases/{phase_id}")
def delete_roadmap_phase(
    project_id: str,
    phase_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    phase = (
        db.query(models.RoadmapPhase)
        .filter(
            models.RoadmapPhase.id == phase_id,
            models.RoadmapPhase.project_id == project.id,
            models.RoadmapPhase.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    db.delete(phase)
    db.commit()
    return {"status": "deleted"}


@router.post("/phases/{phase_id}/milestones", response_model=schemas.RoadmapMilestoneResponse)
def create_milestone(
    project_id: str,
    phase_id: UUID,
    payload: schemas.RoadmapMilestoneCreate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    phase = (
        db.query(models.RoadmapPhase)
        .filter(
            models.RoadmapPhase.id == phase_id,
            models.RoadmapPhase.project_id == project.id,
            models.RoadmapPhase.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    order_index = payload.order_index if payload.order_index is not None else (
        db.query(func.coalesce(func.max(models.RoadmapMilestone.order_index), -1))
        .filter(models.RoadmapMilestone.phase_id == phase_id)
        .scalar()
        + 1
    )
    milestone = models.RoadmapMilestone(
        phase_id=phase.id,
        project_id=project.id,
        workspace_id=project.workspace_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        status=payload.status or "planned",
        order_index=order_index,
        created_by=user_id,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return _milestone_to_schema(milestone)


@router.put("/milestones/{milestone_id}", response_model=schemas.RoadmapMilestoneResponse)
def update_milestone(
    project_id: str,
    milestone_id: UUID,
    payload: schemas.RoadmapMilestoneUpdate,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    milestone = (
        db.query(models.RoadmapMilestone)
        .options(joinedload(models.RoadmapMilestone.task_links).joinedload(models.RoadmapMilestoneTask.task))
        .filter(
            models.RoadmapMilestone.id == milestone_id,
            models.RoadmapMilestone.project_id == project.id,
            models.RoadmapMilestone.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    for field in ["title", "description", "status", "due_date", "ai_summary"]:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(milestone, field, value)
    if payload.order_index is not None:
        milestone.order_index = payload.order_index
    db.commit()
    db.refresh(milestone)
    return _milestone_to_schema(milestone)


@router.delete("/milestones/{milestone_id}")
def delete_milestone(
    project_id: str,
    milestone_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    milestone = (
        db.query(models.RoadmapMilestone)
        .filter(
            models.RoadmapMilestone.id == milestone_id,
            models.RoadmapMilestone.project_id == project.id,
            models.RoadmapMilestone.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    db.delete(milestone)
    db.commit()
    return {"status": "deleted"}


@router.post("/milestones/{milestone_id}/link-task", response_model=schemas.RoadmapMilestoneResponse)
def link_milestone_task(
    project_id: str,
    milestone_id: UUID,
    payload: schemas.RoadmapMilestoneTaskLinkRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    milestone = (
        db.query(models.RoadmapMilestone)
        .options(joinedload(models.RoadmapMilestone.task_links).joinedload(models.RoadmapMilestoneTask.task))
        .filter(
            models.RoadmapMilestone.id == milestone_id,
            models.RoadmapMilestone.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    task = (
        db.query(models.Task)
        .filter(
            models.Task.id == payload.task_id,
            models.Task.workspace_id == project.workspace_id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    existing = (
        db.query(models.RoadmapMilestoneTask)
        .filter(
            models.RoadmapMilestoneTask.milestone_id == milestone_id,
            models.RoadmapMilestoneTask.task_id == payload.task_id,
        )
        .first()
    )
    if payload.action == "link":
        if not existing:
            db.add(
                models.RoadmapMilestoneTask(
                    milestone_id=milestone_id,
                    task_id=payload.task_id,
                    workspace_id=project.workspace_id,
                    linked_by=user_id,
                )
            )
            db.commit()
        else:
            db.refresh(existing)
    else:
        if existing:
            db.delete(existing)
            db.commit()
    db.refresh(milestone)
    return _milestone_to_schema(milestone)


@router.get("/progress", response_model=schemas.RoadmapProgressResponse)
def roadmap_progress(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = _phase_scope(db, project_id, workspace_id)
    phases = _phase_query(db, project).all()
    phase_payloads: list[schemas.RoadmapProgressPhase] = []
    total_tasks = 0
    done_tasks = 0
    for phase in phases:
        milestones = []
        phase_total = 0
        phase_done = 0
        for milestone in phase.milestones:
            percent, milestone_total, milestone_done = _milestone_progress(milestone)
            phase_total += milestone_total
            phase_done += milestone_done
            milestones.append(
                schemas.RoadmapProgressMilestone(
                    id=milestone.id,
                    title=milestone.title,
                    progress_percent=percent,
                    total_tasks=milestone_total,
                    completed_tasks=milestone_done,
                )
            )
        total_tasks += phase_total
        done_tasks += phase_done
        progress = round((phase_done / phase_total) * 100, 1) if phase_total else 0.0
        phase_payloads.append(
            schemas.RoadmapProgressPhase(
                phase_id=phase.id,
                title=phase.title,
                progress_percent=progress,
                total_tasks=phase_total,
                completed_tasks=phase_done,
                milestones=milestones,
            )
        )
    overall = round((done_tasks / total_tasks) * 100, 1) if total_tasks else 0.0
    return schemas.RoadmapProgressResponse(
        project_id=UUID(project_id),
        phases=phase_payloads,
        overall_progress=overall,
        total_tasks=total_tasks,
        completed_tasks=done_tasks,
    )


def _phase_context(phase: models.RoadmapPhase) -> str:
    lines = [f"Phase: {phase.title} ({phase.status})"]
    for milestone in phase.milestones:
        percent, total, done = _milestone_progress(milestone)
        lines.append(f"- Milestone '{milestone.title}' progress {percent}% ({done}/{total} tasks done). Due {milestone.due_date or 'n/a'}")
        for link in milestone.task_links:
            task = link.task
            if not task:
                continue
            lines.append(
                f"    • Task '{task.title}' status {task.status} due {task.due_date or 'n/a'}"
            )
    return "\n".join(lines)


@router.post("/phases/{phase_id}/feedback", response_model=schemas.RoadmapRetrospectiveResponse)
def generate_phase_feedback(
    project_id: str,
    phase_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = _phase_scope(db, project_id, workspace_id)
    phase = (
        _phase_query(db, project)
        .filter(models.RoadmapPhase.id == phase_id)
        .first()
    )
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    context_block = _phase_context(phase)
    prompt = (
        "You are an AI product coach. Review the completed roadmap phase details below and "
        "summarize execution insights. Respond in JSON with keys "
        '{"summary":"","went_well":[],"needs_improvement":[],"lessons":[]}. Use concise bullet phrases.\n'
        f"Phase data:\n{context_block}"
    )
    client = get_openai_client(db, workspace_id)
    summary = "Phase completed. Teams should capture lessons learned."
    went_well: list[str] = []
    needs_improvement: list[str] = []
    lessons: list[str] = []
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You analyze product delivery phases."},
                {"role": "user", "content": prompt},
            ],
        )
        payload = completion.choices[0].message.content or "{}"
        data = json.loads(payload)
        summary = data.get("summary") or summary
        went_well = [str(item) for item in data.get("went_well") or []]
        needs_improvement = [str(item) for item in data.get("needs_improvement") or []]
        lessons = [str(item) for item in data.get("lessons") or []]
    except Exception:
        went_well = ["Completed phase data could not be summarized automatically."]
    return schemas.RoadmapRetrospectiveResponse(
        phase_id=phase.id,
        summary=summary,
        went_well=went_well,
        needs_improvement=needs_improvement,
        lessons=lessons,
        generated_at=datetime.now(timezone.utc),
    )


@router.post("/reprioritize", response_model=list[schemas.RoadmapReprioritizeSuggestion])
def roadmap_reprioritize(
    project_id: str,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = _phase_scope(db, project_id, workspace_id)
    phases = _phase_query(db, project).all()
    context = "\n\n".join(_phase_context(phase) for phase in phases)
    blockers = []
    for phase in phases:
        for milestone in phase.milestones:
            for link in milestone.task_links:
                task = link.task
                if not task:
                    continue
                if task.status != "done" and task.due_date and task.due_date < datetime.now(timezone.utc):
                    blockers.append(f"{task.title} overdue since {task.due_date.date()}")
    blocker_text = "\n".join(blockers) or "No blockers detected."
    prompt = (
        "You are an AI roadmap strategist. Review the roadmap information and recommend reprioritization moves. "
        "Return valid JSON with structure [{\"title\":\"\",\"summary\":\"\",\"impact\":\"\",\"milestone_id\":\"optional\",\"recommended_phase_id\":\"optional\",\"recommended_order_index\":int,\"recommended_status\":\"optional\",\"updates\":[{\"milestone_id\":\"\",\"phase_id\":\"optional\",\"order_index\":int,\"status\":\"optional\"}]}]. "
        "Focus on overdue or blocked work, and aim for at most 4 suggestions.\n"
        f"Roadmap context:\n{context}\n\nBlockers:\n{blocker_text}"
    )
    client = get_openai_client(db, workspace_id)
    suggestions: list[schemas.RoadmapReprioritizeSuggestion] = []
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You adjust software roadmaps based on execution data."},
                {"role": "user", "content": prompt},
            ],
        )
        payload = completion.choices[0].message.content or "{}"
        data = json.loads(payload)
        raw_items = data if isinstance(data, list) else data.get("suggestions") or []
        for item in raw_items:
            updates = []
            for update in item.get("updates") or []:
                updates.append(
                    schemas.RoadmapAIUpdateItem(
                        milestone_id=UUID(update["milestone_id"]),
                        phase_id=UUID(update["phase_id"]) if update.get("phase_id") else None,
                        order_index=update.get("order_index"),
                        status=update.get("status"),
                    )
                )
            suggestions.append(
                schemas.RoadmapReprioritizeSuggestion(
                    suggestion_id=uuid4(),
                    title=item.get("title") or "Suggestion",
                    summary=item.get("summary") or "",
                    impact=item.get("impact"),
                    milestone_id=UUID(item["milestone_id"]) if item.get("milestone_id") else None,
                    recommended_phase_id=UUID(item["recommended_phase_id"]) if item.get("recommended_phase_id") else None,
                    recommended_order_index=item.get("recommended_order_index"),
                    recommended_status=item.get("recommended_status"),
                    updates=updates,
                )
            )
    except Exception:
        pass
    return suggestions


@router.post("/apply-ai-updates", response_model=list[schemas.RoadmapMilestoneResponse])
def apply_ai_updates(
    project_id: str,
    payload: schemas.RoadmapAIUpdateRequest,
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="contributor")
    project = _phase_scope(db, project_id, workspace_id)
    updated: list[schemas.RoadmapMilestoneResponse] = []
    for item in payload.updates:
        milestone = (
            db.query(models.RoadmapMilestone)
            .options(joinedload(models.RoadmapMilestone.task_links).joinedload(models.RoadmapMilestoneTask.task))
            .filter(
                models.RoadmapMilestone.id == item.milestone_id,
                models.RoadmapMilestone.project_id == project.id,
            )
            .first()
        )
        if not milestone:
            continue
        if item.phase_id:
            milestone.phase_id = item.phase_id
        if item.order_index is not None:
            milestone.order_index = item.order_index
        if item.due_date is not None:
            milestone.due_date = item.due_date
        if item.status:
            milestone.status = item.status
        db.add(milestone)
        db.commit()
        db.refresh(milestone)
        updated.append(_milestone_to_schema(milestone))
    return updated


@router.get("/execution-insights", response_model=schemas.RoadmapExecutionInsights)
def execution_insights(project_id: str, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_project_access(db, workspace_id, UUID(project_id), user_id, required_role="viewer")
    project = _phase_scope(db, project_id, workspace_id)
    progress = roadmap_progress(project_id, workspace_id, user_id, db)
    phases = _phase_query(db, project).all()
    blockers: list[str] = []
    tasks_query = (
        db.query(models.Task)
        .filter(models.Task.project_id == project.id, models.Task.workspace_id == project.workspace_id)
        .all()
    )
    now = datetime.now(timezone.utc)
    velocity_last_7 = sum(1 for task in tasks_query if task.status == "done" and task.updated_at and (now - task.updated_at).days <= 7)
    for task in tasks_query:
        if task.status != "done" and task.due_date and task.due_date < now:
            blockers.append(f"{task.title} overdue ({task.due_date.date()})")
    summary_text = (
        f"Overall progress {progress.overall_progress}%. Blockers: {', '.join(blockers) if blockers else 'None'}."
    )
    try:
        client = get_openai_client(db, workspace_id)
        insight_prompt = (
            "Provide a concise project health summary with next steps based on this roadmap progress data:\n"
            f"{summary_text}"
        )
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {"role": "system", "content": "You summarize project execution status."},
                {"role": "user", "content": insight_prompt},
            ],
        )
        ai_summary = completion.choices[0].message.content or summary_text
    except Exception:
        ai_summary = summary_text
    suggestions = roadmap_reprioritize(project_id, workspace_id, user_id, db)
    return schemas.RoadmapExecutionInsights(
        project_id=UUID(project_id),
        overall_progress=progress.overall_progress,
        phase_summaries=progress.phases,
        blockers=blockers,
        velocity_last_7_days=velocity_last_7,
        ai_summary=ai_summary,
        suggestions=suggestions,
    )
