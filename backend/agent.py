from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from . import models, schemas

router = APIRouter(prefix="/users", tags=["user_agents"])


@router.post("/{user_id}/agent", response_model=schemas.AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(user_id: UUID, payload: schemas.AgentCreate, db: Session = Depends(get_db)):
    existing = db.query(models.UserAgent).filter(models.UserAgent.user_id == user_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent already exists")

    agent = models.UserAgent(
        user_id=user_id,
        name=payload.name,
        personality=payload.personality,
        focus_areas=payload.focus_areas,
        integrations=payload.integrations,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/{user_id}/agent", response_model=schemas.AgentResponse)
def get_agent(user_id: UUID, db: Session = Depends(get_db)):
    agent = db.query(models.UserAgent).filter(models.UserAgent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.put("/{user_id}/agent", response_model=schemas.AgentResponse)
def update_agent(user_id: UUID, payload: schemas.AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(models.UserAgent).filter(models.UserAgent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)

    db.commit()
    db.refresh(agent)
    return agent
