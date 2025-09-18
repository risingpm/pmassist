from pydantic import BaseModel
from typing import Any
from datetime import datetime
from uuid import UUID


class PRDCreate(BaseModel):
    feature_name: str | None = None
    prompt: str | None = None  # optional extra user guidance


class PRDRefine(BaseModel):
    instructions: str  # user feedback for refinement


class PRDResponse(BaseModel):
    id: UUID
    project_id: str
    feature_name: str | None = None
    description: str | None = None
    goals: str | None = None
    content: str | None = None   # full Markdown PRD
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True



class DocumentResponse(BaseModel):
    id: UUID
    project_id: str
    filename: str
    chunk_index: str
    content: str
    uploaded_at: datetime
    has_embedding: bool  # ✅ computed field

    class Config:
        from_attributes = True

