from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend import models, schemas
from backend.database import get_db
from backend.rbac import ensure_membership

workspace_router = APIRouter(prefix="/workspaces", tags=["tasks"])
task_router = APIRouter(prefix="/tasks", tags=["tasks"])


def _serialize_task(task: models.Task) -> schemas.TaskResponse:
    return schemas.TaskResponse(
        id=task.id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        epic_id=task.epic_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
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


def _get_task(db: Session, task_id: UUID) -> models.Task:
    task = (
        db.query(models.Task)
        .options(joinedload(models.Task.comments))
        .filter(models.Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


@workspace_router.post("/{workspace_id}/tasks", response_model=schemas.TaskResponse)
def create_task(
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
):
    perm = ensure_membership(db, workspace_id, user_id, required_role="editor")

    if payload.project_id:
        project = (
            db.query(models.Project)
            .filter(models.Project.id == payload.project_id)
            .first()
        )
        if not project or project.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Project not found in this workspace.")

    task = models.Task(
        workspace_id=workspace_id,
        project_id=payload.project_id,
        epic_id=payload.epic_id,
        title=payload.title.strip(),
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        assignee_id=payload.assignee_id,
        due_date=payload.due_date,
        roadmap_id=payload.roadmap_id,
        kb_entry_id=payload.kb_entry_id,
        prd_id=payload.prd_id,
        ai_generated=False,
        created_by=user_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


@workspace_router.get("/{workspace_id}/tasks", response_model=list[schemas.TaskResponse])
def list_tasks(
    workspace_id: UUID,
    user_id: UUID,
    project_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    query = (
        db.query(models.Task)
        .filter(models.Task.workspace_id == workspace_id)
        .order_by(models.Task.created_at.desc())
    )
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    tasks = query.all()
    return [_serialize_task(task) for task in tasks]


@task_router.put("/{task_id}", response_model=schemas.TaskResponse)
def update_task(
    task_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    task = _get_task(db, task_id)
    if task.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Task not found in this workspace.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize_task(task)


@task_router.delete("/{task_id}", status_code=204)
def delete_task(task_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="editor")
    task = _get_task(db, task_id)
    if task.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Task not found in this workspace.")
    db.delete(task)
    db.commit()


@task_router.get("/{task_id}/comments", response_model=list[schemas.TaskCommentResponse])
def list_task_comments(task_id: UUID, workspace_id: UUID, user_id: UUID, db: Session = Depends(get_db)):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    task = _get_task(db, task_id)
    if task.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Task not found in this workspace.")
    comments = (
        db.query(models.TaskComment)
        .filter(models.TaskComment.task_id == task_id)
        .order_by(models.TaskComment.created_at.asc())
        .all()
    )
    return [
        schemas.TaskCommentResponse(
            id=comment.id,
            task_id=comment.task_id,
            author_id=comment.author_id,
            content=comment.content,
            created_at=comment.created_at,
        )
        for comment in comments
    ]


@task_router.post("/{task_id}/comments", response_model=schemas.TaskCommentResponse)
def add_task_comment(
    task_id: UUID,
    workspace_id: UUID,
    user_id: UUID,
    payload: schemas.TaskCommentCreate,
    db: Session = Depends(get_db),
):
    ensure_membership(db, workspace_id, user_id, required_role="viewer")
    task = _get_task(db, task_id)
    if task.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Task not found in this workspace.")
    comment = models.TaskComment(
        task_id=task.id,
        author_id=user_id,
        content=payload.content.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return schemas.TaskCommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        content=comment.content,
        created_at=comment.created_at,
    )
