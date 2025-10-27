from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from backend import schemas
from backend.database import get_db
from backend.models import ProjectLink
from backend.workspaces import get_project_in_workspace

router = APIRouter(prefix="/projects/{project_id}/links", tags=["knowledge"])


@router.get("", response_model=list[schemas.ProjectLinkResponse])
def list_links(project_id: str, workspace_id: UUID, db: Session = Depends(get_db)):
    project = get_project_in_workspace(db, project_id, workspace_id)

    links = (
        db.query(ProjectLink)
        .filter(
            ProjectLink.project_id == project.id,
            ProjectLink.workspace_id.in_([project.workspace_id, None]),
        )
        .order_by(ProjectLink.created_at.desc())
        .all()
    )
    return links


@router.post("", response_model=schemas.ProjectLinkResponse, status_code=status.HTTP_201_CREATED)
def create_link(
    project_id: str,
    payload: schemas.ProjectLinkCreate,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, payload.workspace_id)

    label = payload.label.strip()
    url = payload.url.strip()
    if not label or not url:
        raise HTTPException(status_code=400, detail="Label and URL are required")

    link = ProjectLink(
        project_id=project.id,
        workspace_id=project.workspace_id,
        label=label,
        url=url,
        description=payload.description,
        tags=payload.tags,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{link_id}")
def delete_link(
    project_id: str,
    link_id: UUID,
    workspace_id: UUID,
    db: Session = Depends(get_db),
):
    project = get_project_in_workspace(db, project_id, workspace_id)

    link = (
        db.query(ProjectLink)
        .filter(
            ProjectLink.id == link_id,
            ProjectLink.project_id == project.id,
            ProjectLink.workspace_id.in_([project.workspace_id, None]),
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()
    return {"id": str(link_id), "deleted": True}
