from __future__ import annotations

from typing import Tuple
from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend import models


def get_accessible_template(db: Session, workspace_id: UUID, template_id: UUID) -> models.Template:
    template = (
        db.query(models.Template)
        .options(sa.orm.selectinload(models.Template.versions))
        .filter(
            models.Template.id == template_id,
            sa.or_(
                models.Template.visibility == "system",
                models.Template.workspace_id == workspace_id,
            ),
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if template.visibility == "private" and template.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Template is private to another workspace")
    return template


def get_latest_version(template: models.Template) -> models.TemplateVersion:
    if not template.versions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template missing version history")
    return max(template.versions, key=lambda version: version.version_number)


def get_template_version(db: Session, workspace_id: UUID, template_id: UUID, version_number: int | None = None) -> Tuple[models.Template, models.TemplateVersion]:
    template = get_accessible_template(db, workspace_id, template_id)
    if version_number is None:
        version = get_latest_version(template)
        return template, version

    version = next((item for item in template.versions if item.version_number == version_number), None)
    if not version:
        version = (
            db.query(models.TemplateVersion)
            .filter(
                models.TemplateVersion.template_id == template_id,
                models.TemplateVersion.version_number == version_number,
            )
            .first()
        )
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template version not found")
    return template, version
