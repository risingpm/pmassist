from pydantic import BaseModel
from typing import Any
from datetime import datetime
from uuid import UUID


# ✅ Schema for creating the first PRD
class PRDCreate(BaseModel):
    prompt: str | None = None  # optional extra user guidance


# ✅ Schema for refining an existing PRD
class PRDRefine(BaseModel):
    instructions: str  # user feedback for refinement


# ✅ Schema for returning PRD details
class PRDResponse(BaseModel):
    id: UUID
    project_id: str
    content: Any
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # ✅ replaces orm_mode in Pydantic v2


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

