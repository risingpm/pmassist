from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

# ---------------------------------------------------------
# PRD Schemas
# ---------------------------------------------------------

class PRDCreate(BaseModel):
    feature_name: str     # Optional feature name
    prompt: str           # Optional user prompt

    class Config:
        extra = "ignore"  # Ignore extra/missing fields so `{}` works


class PRDRefine(BaseModel):
    instructions: str  # user feedback for refinement


class PRDResponse(BaseModel):
    id: UUID
    project_id: UUID   # ✅ fix here
    feature_name: str | None = None
    description: str | None = None
    goals: str | None = None
    content: str | None = None
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------
# Document Schemas
# ---------------------------------------------------------

class DocumentResponse(BaseModel):
    id: UUID
    project_id: UUID
    filename: str
    chunk_index: int
    content: str
    uploaded_at: datetime
    has_embedding: bool

    class Config:
        orm_mode = True
