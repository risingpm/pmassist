from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend import schemas
from backend.database import get_db
from backend.models import ProjectComment
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/projects/{project_id}/comments", tags=["knowledge"])


@router.get("", response_model=list[schemas.ProjectCommentResponse])
def list_project_comments(
    project_id: str,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    comments = (
        db.query(ProjectComment)
        .filter(
            ProjectComment.project_id == project.id,
            ProjectComment.workspace_id.in_([project.workspace_id, None]),
        )
        .order_by(ProjectComment.created_at.desc())
        .all()
    )
    return comments


@router.post("", response_model=schemas.ProjectCommentResponse, status_code=status.HTTP_201_CREATED)
def create_project_comment(
    project_id: str,
    payload: schemas.ProjectCommentCreate,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content required")

    comment = ProjectComment(
        project_id=project.id,
        workspace_id=project.workspace_id,
        author_id=payload.author_id,
        content=content,
        tags=payload.tags if payload.tags is not None else None,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.patch("/{comment_id}", response_model=schemas.ProjectCommentResponse)
def update_project_comment(
    project_id: str,
    comment_id: UUID,
    payload: schemas.ProjectCommentUpdate,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    comment = (
        db.query(ProjectComment)
        .filter(
            ProjectComment.id == comment_id,
            ProjectComment.project_id == project.id,
            ProjectComment.workspace_id.in_([project.workspace_id, None]),
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    if payload.content is not None:
        content = payload.content.strip()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content required")
        comment.content = content

    if payload.tags is not None:
        comment.tags = payload.tags

    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{comment_id}")
def delete_project_comment(
    project_id: str,
    comment_id: UUID,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    comment = (
        db.query(ProjectComment)
        .filter(
            ProjectComment.id == comment_id,
            ProjectComment.project_id == project.id,
            ProjectComment.workspace_id.in_([project.workspace_id, None]),
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    db.delete(comment)
    db.commit()
    return {"id": str(comment_id), "deleted": True}
