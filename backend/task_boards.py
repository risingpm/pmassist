from __future__ import annotations

import json
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.ai_providers import get_openai_client
from backend.database import get_db
from backend.knowledge_base_service import build_entry_content, get_relevant_entries
from backend.rbac import ensure_membership

workspace_router = APIRouter(prefix="/workspaces", tags=["task-boards"])
board_router = APIRouter(prefix="/task-boards", tags=["task-boards"])


def _serialize_task(task: models.Task) -> schemas.TaskResponse:
    return schemas.TaskResponse(
        id=task.id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        task_board_id=task.task_board_id,
        epic_id=task.epic_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        position=task.position,
        assignee_id=task.assignee_id,
        due_date=task.due_date,
        roadmap_id=task.roadmap_id,
        kb_entry_id=task.kb_entry_id,
        prd_id=task.prd_id,
        ai_generated=task.ai_generated,
        created_by=task.created_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _serialize_board(board: models.TaskBoard, task_count: int = 0) -> schemas.TaskBoardResponse:
    return schemas.TaskBoardResponse(
        id=board.id,
        workspace_id=board.workspace_id,
        project_id=board.project_id,
        title=board.title,
        description=board.description,
        created_by=board.created_by,
        created_at=board.created_at,
        updated_at=board.updated_at,
        task_count=task_count,
    )


def _get_board(db: Session, board_id: UUID, workspace_id: UUID) -> models.TaskBoard:
    board = (
        db.query(models.TaskBoard)
        .filter(models.TaskBoard.id == board_id, models.TaskBoard.workspace_id == workspace_id)
        .first()
    )
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task board not found.")
    return board


def _ensure_project_in_workspace(db: Session, project_id: UUID | None, workspace_id: UUID):
    if not project_id:
        return
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found in workspace.")


def _extract_json_payload(raw: str) -> list[dict]:
    if not raw:
        return []
    candidates: list[str] = []
    trimmed = raw.strip()
    if trimmed:
        candidates.append(trimmed)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
    if fenced:
        snippet = fenced.group(1).strip()
        if snippet:
            candidates.append(snippet)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and isinstance(parsed.get("tasks"), list):
            return parsed["tasks"]
    raise ValueError("Assistant did not return valid JSON.")


def _serialize_context(entries: list[models.KnowledgeBaseEntry]) -> list[schemas.KnowledgeBaseContextItem]:
    items: list[schemas.KnowledgeBaseContextItem] = []
    for entry in entries:
        snippet = build_entry_content(entry, clip=800) or entry.content or ""
        items.append(
            schemas.KnowledgeBaseContextItem(
                id=entry.id,
                title=entry.title,
                type=entry.type,
                snippet=snippet,
            )
        )
    return items


@workspace_router.post("/{workspace_id}/task-boards", response_model=schemas.TaskBoardResponse)
def create_task_board(
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskBoardCreate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    _ensure_project_in_workspace(db, payload.project_id, workspace_id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task board title is required.")

    board = models.TaskBoard(
        workspace_id=workspace_id,
        project_id=payload.project_id,
        title=title,
        description=payload.description,
        created_by=user_id,
    )
    db.add(board)
    db.commit()
    db.refresh(board)
    return _serialize_board(board, task_count=0)


@workspace_router.get("/{workspace_id}/task-boards", response_model=list[schemas.TaskBoardResponse])
def list_task_boards(
    workspace_id: UUID,
    user_id: UUID,
    project_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    query = db.query(models.TaskBoard).filter(models.TaskBoard.workspace_id == workspace_id)
    if project_id:
        query = query.filter(models.TaskBoard.project_id == project_id)
    boards = query.order_by(models.TaskBoard.updated_at.desc()).all()
    if not boards:
        return []

    board_ids = [board.id for board in boards]
    count_rows = (
        db.query(models.Task.task_board_id, func.count(models.Task.id))
        .filter(models.Task.task_board_id.in_(board_ids))
        .group_by(models.Task.task_board_id)
        .all()
    )
    count_map = {board_id: count for board_id, count in count_rows}
    return [_serialize_board(board, task_count=int(count_map.get(board.id, 0))) for board in boards]


@board_router.get("/{board_id}", response_model=schemas.TaskBoardDetailResponse)
def get_task_board(board_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    board = _get_board(db, board_id, workspace_id)
    tasks = (
        db.query(models.Task)
        .filter(models.Task.workspace_id == workspace_id, models.Task.task_board_id == board.id)
        .order_by(models.Task.status.asc(), models.Task.position.asc(), models.Task.created_at.asc())
        .all()
    )
    columns: dict[schemas.TaskStatusLiteral, list[schemas.TaskResponse]] = {
        "todo": [],
        "in_progress": [],
        "done": [],
    }
    for task in tasks:
        if task.status in columns:
            columns[task.status].append(_serialize_task(task))
    return schemas.TaskBoardDetailResponse(
        board=_serialize_board(board, task_count=len(tasks)),
        columns=columns,
    )


@board_router.put("/{board_id}", response_model=schemas.TaskBoardResponse)
def update_task_board(
    board_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskBoardUpdate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    board = _get_board(db, board_id, workspace_id)
    updates = payload.model_dump(exclude_unset=True)
    if "project_id" in updates:
        _ensure_project_in_workspace(db, updates["project_id"], workspace_id)
    if "title" in updates and updates["title"] is not None:
        updates["title"] = updates["title"].strip()
        if not updates["title"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task board title is required.")
    for field, value in updates.items():
        setattr(board, field, value)
    db.add(board)
    db.commit()
    db.refresh(board)
    task_count = (
        db.query(func.count(models.Task.id))
        .filter(models.Task.workspace_id == workspace_id, models.Task.task_board_id == board.id)
        .scalar()
        or 0
    )
    return _serialize_board(board, task_count=int(task_count))


@board_router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_board(board_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    board = _get_board(db, board_id, workspace_id)
    (
        db.query(models.Task)
        .filter(models.Task.workspace_id == workspace_id, models.Task.task_board_id == board.id)
        .update({models.Task.task_board_id: None}, synchronize_session=False)
    )
    db.delete(board)
    db.commit()


@board_router.post("/{board_id}/tasks/bulk", response_model=schemas.TaskBoardBulkCreateResponse)
def bulk_create_tasks(
    board_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskBoardBulkCreateRequest,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    board = _get_board(db, board_id, workspace_id)
    project_id = payload.project_id if payload.project_id is not None else board.project_id
    _ensure_project_in_workspace(db, project_id, workspace_id)

    existing_positions = (
        db.query(models.Task.status, func.max(models.Task.position))
        .filter(models.Task.workspace_id == workspace_id, models.Task.task_board_id == board.id)
        .group_by(models.Task.status)
        .all()
    )
    next_position = {status: int(max_pos or -1) + 1 for status, max_pos in existing_positions}
    created: list[models.Task] = []
    for item in payload.tasks:
        title = item.title.strip()
        if not title:
            continue
        position = item.position
        if position is None:
            position = next_position.get(item.status, 0)
            next_position[item.status] = position + 1
        task = models.Task(
            workspace_id=workspace_id,
            project_id=project_id,
            task_board_id=board.id,
            epic_id=item.epic_id,
            title=title,
            description=item.description,
            status=item.status,
            priority=item.priority,
            position=position,
            assignee_id=item.assignee_id,
            due_date=item.due_date,
            roadmap_id=item.roadmap_id,
            kb_entry_id=item.kb_entry_id,
            prd_id=item.prd_id,
            ai_generated=True,
            created_by=user_id,
        )
        db.add(task)
        created.append(task)

    db.commit()
    for item in created:
        db.refresh(item)
    return schemas.TaskBoardBulkCreateResponse(tasks=[_serialize_task(task) for task in created])


@board_router.patch("/{board_id}/tasks/reorder", response_model=schemas.TaskBoardDetailResponse)
def reorder_board_tasks(
    board_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskBoardTaskReorderRequest,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    board = _get_board(db, board_id, workspace_id)
    if not payload.updates:
        return get_task_board(board_id=board_id, workspace_id=workspace_id, user_id=user_id, db=db)

    task_ids = [item.task_id for item in payload.updates]
    tasks = (
        db.query(models.Task)
        .filter(models.Task.workspace_id == workspace_id, models.Task.id.in_(task_ids))
        .all()
    )
    task_map = {task.id: task for task in tasks}
    for update in payload.updates:
        task = task_map.get(update.task_id)
        if not task or task.task_board_id != board.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found in this board.")
        task.status = update.status
        task.position = update.position
        db.add(task)
    db.commit()
    return get_task_board(board_id=board_id, workspace_id=workspace_id, user_id=user_id, db=db)


@board_router.post("/{board_id}/generate", response_model=schemas.TaskBoardGenerateResponse)
def generate_board_tasks(
    board_id: UUID,
    workspace_id: UUID,
    payload: schemas.TaskBoardGenerateRequest,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, payload.user_id, required_role="editor")
    board = _get_board(db, board_id, workspace_id)
    project_id = payload.project_id if payload.project_id is not None else board.project_id
    _ensure_project_in_workspace(db, project_id, workspace_id)

    prompt = (payload.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt is required.")

    project = None
    if project_id:
        project = db.query(models.Project).filter(models.Project.id == project_id).first()

    source_chunks: list[str] = [prompt]
    if payload.prd_id:
        prd = db.query(models.PRD).filter(models.PRD.id == payload.prd_id).first()
        if prd and prd.content:
            source_chunks.append(prd.content[:4000])
    if payload.roadmap_id:
        roadmap = db.query(models.Roadmap).filter(models.Roadmap.id == payload.roadmap_id).first()
        if roadmap and roadmap.content:
            source_chunks.append(roadmap.content[:4000])
    source_text = "\n\n".join(chunk for chunk in source_chunks if chunk)

    kb_entries = get_relevant_entries(db, workspace_id, source_text or (project.description if project else ""), top_n=4)
    context_entries = _serialize_context(kb_entries)
    context_block = "\n\n".join(f"{item.title} ({item.type})\n{item.snippet}" for item in context_entries) or "No context provided."

    ai_prompt = f"""
You are a senior technical program manager. Convert the input into actionable task board items.
Return JSON only as an array. Each item should have:
title, description, priority(low|medium|high|critical), status(todo|in_progress|done), effort(optional).
No prose outside JSON.

Board title: {board.title}
Board description: {board.description or "N/A"}
Project: {(project.title if project else "N/A")}
Project goals: {(project.goals if project else "N/A")}

User prompt and source:
{source_text}

Relevant context:
{context_block}
"""

    try:
        client = get_openai_client(db, workspace_id)
        response = client.chat.completions.create(
            model="gpt-5-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "You output JSON only."},
                {"role": "user", "content": ai_prompt},
            ],
        )
        raw = response.choices[0].message.content or ""
        parsed = _extract_json_payload(raw)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate tasks: {exc}") from exc

    tasks: list[schemas.TaskGenerationItem] = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "").strip()
        if not title:
            continue
        description = str(entry.get("description") or "").strip() or "Draft task generated from Task Board Builder."
        priority = str(entry.get("priority") or "medium").lower()
        effort = entry.get("effort")
        status_value = str(entry.get("status") or "todo").lower().replace("-", "_")
        if priority not in {"low", "medium", "high", "critical"}:
            priority = "medium"
        if status_value not in {"todo", "in_progress", "done"}:
            status_value = "todo"
        tasks.append(
            schemas.TaskGenerationItem(
                title=title,
                description=description,
                priority=priority,  # type: ignore[arg-type]
                effort=str(effort) if effort else None,
                status=status_value,  # type: ignore[arg-type]
            )
        )

    return schemas.TaskBoardGenerateResponse(
        assistant_message="I drafted tasks for your board. Review and save the ones you want.",
        tasks=tasks,
        context_entries=context_entries,
    )
