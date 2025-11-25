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
    template_id: UUID | None = None

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
    context_entries: list["KnowledgeBaseContextItem"] | None = None

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
    template_id: UUID | None = None


class RoadmapGenerateResponse(BaseModel):
    message: str
    conversation_history: list[RoadmapChatMessage]
    roadmap: str | None = None
    action: str
    suggestions: list[str] | None = None
    context_entries: list["KnowledgeBaseContextItem"] | None = None
    kb_entry_id: UUID | None = None


class RoadmapChatTurnRequest(BaseModel):
    workspace_id: UUID
    project_id: UUID
    user_id: UUID
    prompt: str
    chat_id: UUID | None = None
    template_id: UUID | None = None


class RoadmapChatRecord(BaseModel):
    id: UUID
    workspace_id: UUID
    project_id: UUID | None = None
    user_id: UUID | None = None
    messages: list[RoadmapChatMessage]
    output_entry_id: UUID | None = None
    created_at: datetime


class RoadmapChatResponse(RoadmapChatRecord):
    assistant_message: str
    roadmap: str | None = None
    context_entries: list["KnowledgeBaseContextItem"] | None = None
    action: str
    suggestions: list[str] | None = None
    kb_entry_id: UUID | None = None


class BuilderChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class BuilderChatRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID
    project_id: UUID | None = None
    prompt: str
    history: list[BuilderChatMessage] = Field(default_factory=list)


class BuilderChatResponse(BaseModel):
    message: str
    code: str
    design_tokens: dict[str, Any]
    context_entries: list["KnowledgeBaseContextItem"] | None = None
    suggestions: list[str] | None = None


class BuilderPreviewRequest(BaseModel):
    code: str


class BuilderPreviewResponse(BaseModel):
    preview_html: str


class BuilderSaveRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID
    project_id: UUID | None = None
    title: str
    prompt: str
    code: str
    preview_html: str | None = None
    design_tokens: dict[str, Any] | None = None


class BuilderPrototypeResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    project_id: UUID | None = None
    title: str
    prompt: str
    code: str
    preview_html: str | None = None
    design_tokens: dict[str, Any] | None = None
    created_by: UUID | None = None
    created_at: datetime


TaskStatusLiteral = Literal["todo", "in_progress", "done"]
TaskPriorityLiteral = Literal["low", "medium", "high", "critical"]


class TaskBase(BaseModel):
    project_id: UUID | None = None
    epic_id: UUID | None = None
    title: str
    description: str | None = None
    status: TaskStatusLiteral = "todo"
    priority: TaskPriorityLiteral = "medium"
    assignee_id: UUID | None = None
    due_date: datetime | None = None
    roadmap_id: UUID | None = None
    kb_entry_id: UUID | None = None
    prd_id: UUID | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    project_id: UUID | None = None
    epic_id: UUID | None = None
    title: str | None = None
    description: str | None = None
    status: TaskStatusLiteral | None = None
    priority: TaskPriorityLiteral | None = None
    assignee_id: UUID | None = None
    due_date: datetime | None = None
    roadmap_id: UUID | None = None
    kb_entry_id: UUID | None = None
    prd_id: UUID | None = None


class TaskResponse(TaskBase):
    id: UUID
    workspace_id: UUID
    ai_generated: bool
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskCommentCreate(BaseModel):
    content: str


class TaskCommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    author_id: UUID | None = None
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskGenerationItem(BaseModel):
    title: str
    description: str
    priority: TaskPriorityLiteral = "medium"
    effort: str | None = None
    status: TaskStatusLiteral = "todo"


class TaskGenerationRequest(BaseModel):
    workspace_id: UUID
    project_id: UUID
    user_id: UUID
    prd_id: UUID | None = None
    roadmap_id: UUID | None = None
    instructions: str | None = None


class TaskGenerationResponse(BaseModel):
    tasks: list[TaskGenerationItem]
    context_entries: list["KnowledgeBaseContextItem"] | None = None


TemplateVisibilityLiteral = Literal["private", "shared", "system"]
TemplateFormatLiteral = Literal["markdown", "json"]


class TemplateVersionResponse(BaseModel):
    id: UUID
    template_id: UUID
    version_number: int
    content: str
    content_format: TemplateFormatLiteral
    metadata: dict[str, Any] | None = None
    created_by: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TemplateResponse(BaseModel):
    id: UUID
    workspace_id: UUID | None = None
    title: str
    description: str | None = None
    category: str | None = None
    visibility: TemplateVisibilityLiteral
    tags: list[str]
    version: int
    is_recommended: bool
    recommended_reason: str | None = None
    created_by: UUID | None = None
    updated_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    latest_version: TemplateVersionResponse

    class Config:
        from_attributes = True


class TemplateDetailResponse(TemplateResponse):
    versions: list[TemplateVersionResponse]


class TemplateCreate(BaseModel):
    title: str
    description: str | None = None
    category: str | None = None
    visibility: TemplateVisibilityLiteral = "private"
    tags: list[str] | None = None
    content: str
    content_format: TemplateFormatLiteral = "markdown"
    metadata: dict[str, Any] | None = None


class TemplateUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    visibility: TemplateVisibilityLiteral | None = None
    tags: list[str] | None = None
    content: str | None = None
    content_format: TemplateFormatLiteral | None = None
    metadata: dict[str, Any] | None = None


class TemplateForkRequest(BaseModel):
    title: str | None = None
    visibility: TemplateVisibilityLiteral | None = None


class TemplateApplyResponse(BaseModel):
    template: TemplateResponse
    version: TemplateVersionResponse


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


class GoogleAuthRequest(BaseModel):
    credential: str


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


# ---------------------------------------------------------
# Workspace AI Provider
# ---------------------------------------------------------

class WorkspaceAIProviderStatus(BaseModel):
    provider: Literal["openai"]
    is_enabled: bool
    updated_at: datetime | None = None
    updated_by: UUID | None = None


class WorkspaceAIProviderSave(BaseModel):
    provider: Literal["openai"] = "openai"
    api_key: str
    organization: str | None = None
    project: str | None = None
    user_id: UUID


class WorkspaceAIProviderTestRequest(BaseModel):
    provider: Literal["openai"] = "openai"
    api_key: str
    organization: str | None = None
    project: str | None = None
    user_id: UUID


class WorkspaceAIProviderTestResponse(BaseModel):
    ok: bool = True


# ---------------------------------------------------------
# Dashboard
# ---------------------------------------------------------

class DashboardPRDItem(BaseModel):
    id: UUID
    title: str
    status: str
    updated_at: datetime


class DashboardRoadmapSummary(BaseModel):
    current_phase: str | None = None
    completion_percent: float
    total_tasks: int
    done_tasks: int


class DashboardTaskSummary(BaseModel):
    total: int
    todo: int
    in_progress: int
    done: int


class DashboardSprintSummary(BaseModel):
    velocity: float
    completed_last_7_days: int
    velocity_trend: list[float]
    updated_at: datetime


class DashboardOverviewResponse(BaseModel):
    prds: list[DashboardPRDItem]
    roadmap: DashboardRoadmapSummary
    tasks: DashboardTaskSummary
    sprint: DashboardSprintSummary
    updated_at: datetime


class DashboardCoachRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID


class DashboardCoachResponse(BaseModel):
    message: str
    suggestions: list[str]
    confidence: float


# ---------------------------------------------------------
# Knowledge Base
# ---------------------------------------------------------

KnowledgeBaseEntryType = Literal[
    "document",
    "prd",
    "insight",
    "research",
    "repo",
    "ai_output",
    "roadmap",
    "prototype",
]


class KnowledgeBaseResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: str | None = None
    created_at: datetime


class KnowledgeBaseEntryResponse(BaseModel):
    id: UUID
    kb_id: UUID
    type: KnowledgeBaseEntryType
    title: str
    content: str | None = None
    file_url: str | None = None
    source_url: str | None = None
    created_by: UUID | None = None
    created_by_email: EmailStr | None = None
    project_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class KnowledgeBaseEntryCreate(BaseModel):
    type: KnowledgeBaseEntryType = "insight"
    title: str
    content: str | None = None
    source_url: str | None = None
    project_id: UUID | None = None
    tags: list[str] | None = None


class KnowledgeBaseEntryUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    source_url: str | None = None
    tags: list[str] | None = None


class KnowledgeBaseContextItem(BaseModel):
    id: UUID
    title: str
    type: KnowledgeBaseEntryType
    snippet: str


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
