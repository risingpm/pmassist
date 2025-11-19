from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal, Any
from datetime import datetime
from uuid import UUID

WorkspaceRoleLiteral = Literal["admin", "editor", "viewer"]
ProjectRoleLiteral = Literal["owner", "contributor", "viewer"]

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
    workspace_role: WorkspaceRoleLiteral | None = None


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    role: WorkspaceRoleLiteral | None = None

    class Config:
        from_attributes = True


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceUpdate(BaseModel):
    name: str


class WorkspaceMemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    email: EmailStr
    display_name: str
    role: WorkspaceRoleLiteral
    joined_at: datetime


class WorkspaceMemberRoleUpdate(BaseModel):
    role: WorkspaceRoleLiteral


class WorkspaceInviteRequest(BaseModel):
    email: EmailStr
    role: WorkspaceRoleLiteral | None = None


class WorkspaceInvitationResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    email: EmailStr
    role: WorkspaceRoleLiteral
    token: str
    invited_by: UUID | None = None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    cancelled_at: datetime | None = None


class WorkspaceInvitationAcceptRequest(BaseModel):
    user_id: UUID


class ProjectMemberResponse(BaseModel):
    id: UUID | None = None
    project_id: UUID
    user_id: UUID
    email: EmailStr
    display_name: str
    role: ProjectRoleLiteral
    inherited: bool = False
    joined_at: datetime | None = None


class ProjectMemberCreateRequest(BaseModel):
    user_id: UUID
    role: ProjectRoleLiteral = "viewer"


class ProjectMemberRoleUpdate(BaseModel):
    role: ProjectRoleLiteral


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


# ---------------------------------------------------------
# Project comments
# ---------------------------------------------------------


class ProjectCommentBase(BaseModel):
    content: str = Field(min_length=1)
    tags: list[str] | None = None


class ProjectCommentCreate(ProjectCommentBase):
    author_id: UUID | None = None


class ProjectCommentUpdate(BaseModel):
    content: str | None = None
    tags: list[str] | None = None


class ProjectCommentResponse(ProjectCommentBase):
    id: UUID
    project_id: str
    workspace_id: UUID | None = None
    author_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------
# Prototypes
# ---------------------------------------------------------


class PrototypeComponent(BaseModel):
    kind: Literal[
        "hero",
        "form",
        "list",
        "cta",
        "stats",
        "custom",
        "navigation",
        "modal",
    ]
    title: str | None = None
    description: str | None = None
    fields: list[str] | None = None
    actions: list[str] = Field(default_factory=list)
    sample_items: list[str] | None = None
    dataset: list[dict[str, Any]] | None = None


class PrototypeScreen(BaseModel):
    name: str
    goal: str
    primary_actions: list[str]
    layout_notes: str | None = None
    components: list[PrototypeComponent] = Field(default_factory=list)


class PrototypeSpec(BaseModel):
    title: str
    summary: str
    goal: str | None = None
    success_metrics: list[str] | None = None
    key_screens: list[PrototypeScreen]
    user_flow: list[str] | None = None
    visual_style: str | None = None
    call_to_action: str | None = None
    metadata: dict[str, Any] | None = None


class PrototypeResponse(BaseModel):
    id: UUID
    project_id: UUID
    roadmap_id: UUID | None
    roadmap_version: int | None
    phase: str | None
    title: str
    summary: str
    spec: PrototypeSpec
    html_preview: str | None = None
    bundle_url: str | None = None
    workspace_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PrototypeGenerateRequest(BaseModel):
    workspace_id: UUID
    phase: str | None = None
    focus: str | None = None
    count: int | None = 1


# ---------------------------------------------------------
# Project links
# ---------------------------------------------------------


class ProjectLinkBase(BaseModel):
    label: str
    url: str
    description: str | None = None
    tags: list[str] | None = None


class ProjectLinkCreate(ProjectLinkBase):
    workspace_id: UUID


class ProjectLinkResponse(ProjectLinkBase):
    id: UUID
    project_id: str
    workspace_id: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------
# Prototype sessions (agent)
# ---------------------------------------------------------


class PrototypeAgentMessage(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class PrototypeSessionResponse(BaseModel):
    id: UUID
    project_id: str
    workspace_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    latest_spec: PrototypeSpec | None = None
    bundle_url: str | None = None
    messages: list[PrototypeAgentMessage]

    class Config:
        from_attributes = True


class PrototypeSessionCreateRequest(BaseModel):
    workspace_id: UUID
    prompt: str | None = None


class PrototypeSessionMessageRequest(BaseModel):
    workspace_id: UUID
    message: str
