from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal, Any
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
    workspace_id: UUID | None = None

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
    workspace_id: UUID | None = None

    class Config:
        orm_mode = True


# ---------------------------------------------------------
# Roadmap Chat Schemas
# ---------------------------------------------------------

class RoadmapChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RoadmapGenerateRequest(BaseModel):
    prompt: str
    conversation_history: list[RoadmapChatMessage] = Field(default_factory=list)
    user_id: UUID | None = None
    workspace_id: UUID


class RoadmapGenerateResponse(BaseModel):
    message: str
    conversation_history: list[RoadmapChatMessage]
    roadmap: str | None = None
    action: str
    suggestions: list[str] | None = None


class RoadmapUpdateRequest(BaseModel):
    content: str


class RoadmapContentResponse(BaseModel):
    content: str
    updated_at: datetime


# ---------------------------------------------------------
# User Agent Schemas
# ---------------------------------------------------------

class AgentBase(BaseModel):
    name: str
    personality: Optional[str] = None
    focus_areas: list[str] = Field(default_factory=list)
    integrations: dict[str, Any] = Field(default_factory=dict)


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    personality: Optional[str] = None
    focus_areas: Optional[list[str]] = None
    integrations: Optional[dict[str, Any]] = None


class AgentResponse(AgentBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------
# Auth Schemas
# ---------------------------------------------------------


class AuthCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    id: UUID
    email: EmailStr
    workspace_id: UUID | None = None
    workspace_name: str | None = None


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceUpdate(BaseModel):
    name: str


# ---------------------------------------------------------
# Password reset
# ---------------------------------------------------------


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    reset_token: str
    expires_at: datetime


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
