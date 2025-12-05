from pydantic import BaseModel, Field, EmailStr, AnyUrl
from typing import Optional, Literal, Any
from datetime import datetime
from uuid import UUID

WorkspaceRoleLiteral = Literal["admin", "editor", "viewer"]
ProjectRoleLiteral = Literal["owner", "contributor", "viewer"]
TaskStatusLiteral = Literal["todo", "in_progress", "done"]

class VerificationDetails(BaseModel):
    status: Literal["passed", "failed", "skipped", "declined"]
    message: str



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
    created_by: UUID | None = None
    context_entries: list["KnowledgeBaseContextItem"] | None = None
    verification: VerificationDetails | None = None

    class Config:
        from_attributes = True


class PRDSaveRequest(BaseModel):
    content: str
    feature_name: str | None = None
    description: str | None = None


class PRDVersionSummary(BaseModel):
    id: UUID
    version: int
    feature_name: str | None = None
    is_active: bool
    created_at: datetime
    created_by: UUID | None = None
    author_name: str | None = None
    decision_count: int = 0


class PRDDiffLine(BaseModel):
    type: Literal["equal", "insert", "delete", "replace"]
    left_line: str | None = None
    right_line: str | None = None
    left_number: int | None = None
    right_number: int | None = None


class PRDDiffResponse(BaseModel):
    version_a: int
    version_b: int
    prd_a_id: UUID | None = None
    prd_b_id: UUID | None = None
    diff: list[PRDDiffLine]


class PRDDecisionNoteCreate(BaseModel):
    decision: str
    rationale: str | None = None
    version: int | None = None


class PRDDecisionNoteResponse(BaseModel):
    id: UUID
    prd_id: UUID
    project_id: UUID
    workspace_id: UUID
    version: int
    decision: str
    rationale: str | None = None
    created_by: UUID | None = None
    author_name: str | None = None
    created_at: datetime


class PRDQARequest(BaseModel):
    question: str
    prd_id: UUID | None = None
    version_a: int | None = None
    version_b: int | None = None


class PRDQAResponse(BaseModel):
    answer: str
    context_entries: list["KnowledgeBaseContextItem"] = Field(default_factory=list)
    used_versions: list[int] = Field(default_factory=list)
    verification: VerificationDetails | None = None


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
    verification: VerificationDetails | None = None


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
    verification: VerificationDetails | None = None


class RoadmapPhaseCreate(BaseModel):
    title: str
    description: str | None = None
    order_index: int | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    status: str | None = None


class RoadmapPhaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order_index: int | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    status: str | None = None


class RoadmapMilestoneCreate(BaseModel):
    title: str
    description: str | None = None
    due_date: datetime | None = None
    status: str | None = None
    order_index: int | None = None


class RoadmapMilestoneUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    status: str | None = None
    order_index: int | None = None
    ai_summary: str | None = None


class RoadmapLinkedTask(BaseModel):
    id: UUID
    title: str
    status: TaskStatusLiteral
    assignee_id: UUID | None = None
    due_date: datetime | None = None
    project_id: UUID | None = None


class RoadmapMilestoneResponse(BaseModel):
    id: UUID
    phase_id: UUID
    title: str
    description: str | None = None
    due_date: datetime | None = None
    status: str
    order_index: int
    progress_percent: float
    linked_tasks: list[RoadmapLinkedTask] = Field(default_factory=list)
    ai_summary: str | None = None


class RoadmapPhaseResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    order_index: int
    status: str
    start_date: datetime | None = None
    due_date: datetime | None = None
    progress_percent: float
    milestones: list[RoadmapMilestoneResponse] = Field(default_factory=list)


class RoadmapMilestoneTaskLinkRequest(BaseModel):
    task_id: UUID
    action: Literal["link", "unlink"] = "link"


class RoadmapProgressMilestone(BaseModel):
    id: UUID
    title: str
    progress_percent: float
    total_tasks: int
    completed_tasks: int


class RoadmapProgressPhase(BaseModel):
    phase_id: UUID
    title: str
    progress_percent: float
    total_tasks: int
    completed_tasks: int
    milestones: list[RoadmapProgressMilestone] = Field(default_factory=list)


class RoadmapProgressResponse(BaseModel):
    project_id: UUID
    phases: list[RoadmapProgressPhase]
    overall_progress: float
    total_tasks: int
    completed_tasks: int


class RoadmapRetrospectiveResponse(BaseModel):
    phase_id: UUID
    summary: str
    went_well: list[str]
    needs_improvement: list[str]
    lessons: list[str]
    generated_at: datetime


class RoadmapAIUpdateItem(BaseModel):
    milestone_id: UUID
    phase_id: UUID | None = None
    order_index: int | None = None
    due_date: datetime | None = None
    status: str | None = None


class RoadmapReprioritizeSuggestion(BaseModel):
    suggestion_id: UUID
    title: str
    summary: str
    impact: str | None = None
    milestone_id: UUID | None = None
    recommended_phase_id: UUID | None = None
    recommended_order_index: int | None = None
    recommended_status: str | None = None
    updates: list[RoadmapAIUpdateItem] = Field(default_factory=list)


class RoadmapAIUpdateRequest(BaseModel):
    updates: list[RoadmapAIUpdateItem]


class RoadmapExecutionInsights(BaseModel):
    project_id: UUID
    overall_progress: float
    phase_summaries: list[RoadmapProgressPhase]
    blockers: list[str]
    velocity_last_7_days: int
    ai_summary: str
    suggestions: list[RoadmapReprioritizeSuggestion] = Field(default_factory=list)


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


class WorkspaceAgentBase(BaseModel):
    name: str
    description: str | None = None
    purpose: str | None = None
    instructions: str
    tone: str | None = None
    model_name: str = "gpt-4o-mini"
    temperature: float = 0.3
    max_tokens: int | None = None
    modules: list[str] = Field(default_factory=list)
    tools: dict[str, Any] = Field(default_factory=dict)
    mcp_connection_ids: list[UUID] = Field(default_factory=list)
    avatar_url: str | None = None
    accent_color: str | None = None
    is_public: bool | None = None


class WorkspaceAgentCreate(WorkspaceAgentBase):
    pass


class WorkspaceAgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    purpose: str | None = None
    instructions: str | None = None
    tone: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    modules: list[str] | None = None
    tools: dict[str, Any] | None = None
    mcp_connection_ids: list[UUID] | None = None
    avatar_url: str | None = None
    accent_color: str | None = None
    is_public: bool | None = None


class WorkspaceAgentResponse(WorkspaceAgentBase):
    id: UUID
    workspace_id: UUID
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    shared_at: datetime | None = None
    cloned_from_id: UUID | None = None

    class Config:
        from_attributes = True


class WorkspaceAgentTemplate(WorkspaceAgentResponse):
    pass


class MCPConnectionBase(BaseModel):
    name: str
    description: str | None = None
    endpoint_url: AnyUrl
    tool_name: str
    prompt_field: str = "prompt"
    context_field: str | None = None
    default_arguments: dict[str, Any] = Field(default_factory=dict)


class MCPConnectionCreate(MCPConnectionBase):
    auth_token: str | None = None


class MCPConnectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    endpoint_url: AnyUrl | None = None
    tool_name: str | None = None
    prompt_field: str | None = None
    context_field: str | None = None
    default_arguments: dict[str, Any] | None = None
    auth_token: str | None = None
    clear_auth_token: bool | None = None


class MCPConnectionResponse(MCPConnectionBase):
    id: UUID
    workspace_id: UUID
    has_token: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentRunRequest(BaseModel):
    prompt: str
    project_id: UUID | None = None


class AgentRunResponse(BaseModel):
    run_id: UUID
    agent_id: UUID
    response: str
    context_used: list["KnowledgeBaseContextItem"]
    status: Literal["completed", "error"]
    created_at: datetime


class AgentRunLog(BaseModel):
    id: UUID
    agent_id: UUID
    prompt: str
    response: str | None = None
    status: Literal["completed", "error"]
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectAgentAssignRequest(BaseModel):
    agent_ids: list[UUID]


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


class AuthInitializeRequest(BaseModel):
    user_id: UUID


class AuthInitializeResponse(BaseModel):
    workspace_id: UUID
    project_id: UUID | None = None
    has_demo: bool = False


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


class WorkspaceOnboardingStep(BaseModel):
    id: str
    completed: bool


class WorkspaceOnboardingStatus(BaseModel):
    workspace_id: UUID
    workspace_name: str
    user_name: str | None = None
    welcome_acknowledged: bool
    steps: list[WorkspaceOnboardingStep]
    completed_steps: int
    total_steps: int
    next_step_id: str | None = None


class WorkspaceOnboardingUpdate(BaseModel):
    welcome_acknowledged: bool | None = None


# ---------------------------------------------------------
# Workspace AI Provider
# ---------------------------------------------------------

class WorkspaceAIProviderStatus(BaseModel):
    provider: Literal["openai"]
    is_enabled: bool
    has_api_key: bool
    masked_key_preview: str | None = None
    key_suffix: str | None = None
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
    api_key: str | None = None
    organization: str | None = None
    project: str | None = None
    user_id: UUID
    use_saved_key: bool = False


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


class WorkspaceRecommendation(BaseModel):
    title: str
    description: str
    severity: Literal["info", "opportunity", "warning", "risk"] | None = None
    related_entry_id: UUID | None = None
    related_entry_title: str | None = None


class WorkspaceInsightResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    summary: str
    recommendations: list[WorkspaceRecommendation]
    confidence: float | None = None
    metrics: DashboardOverviewResponse
    context_entries: list["KnowledgeBaseContextItem"] = Field(default_factory=list)
    generated_at: datetime
    verification: VerificationDetails | None = None


class WorkspaceInsightRegenerateRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID


class WorkspaceMemoryBase(BaseModel):
    content: str
    source: str = "manual"
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] | None = None
    importance: float | None = None


class WorkspaceMemoryCreate(WorkspaceMemoryBase):
    pass


class WorkspaceMemoryUpdate(BaseModel):
    pinned: bool | None = None
    tags: list[str] | None = None
    importance: float | None = None


class WorkspaceMemory(BaseModel):
    id: UUID
    workspace_id: UUID
    content: str
    source: str
    metadata: dict[str, Any] | None = Field(alias="context_metadata", default=None)
    tags: list[str] = Field(default_factory=list)
    importance: float | None = None
    pinned: bool
    created_by: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True
        allow_population_by_field_name = True
    force_refresh: bool = False


class WorkspaceChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class WorkspaceChatTurnRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID
    question: str
    session_id: UUID | None = None


class WorkspaceChatTurnResponse(BaseModel):
    session_id: UUID
    answer: str
    messages: list[WorkspaceChatMessage]
    context_entries: list["KnowledgeBaseContextItem"] = Field(default_factory=list)
    updated_at: datetime
    verification: VerificationDetails | None = None


# ---------------------------------------------------------
# Strategy Hub
# ---------------------------------------------------------


class StrategicPillar(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    progress_percent: float = 0.0
    related_prds: list[dict[str, Any]] = Field(default_factory=list)
    related_roadmaps: list[dict[str, Any]] = Field(default_factory=list)
    related_tasks: list[dict[str, Any]] = Field(default_factory=list)


class StrategicInsight(BaseModel):
    id: UUID
    title: str
    description: str
    severity: str | None = None
    source_type: str | None = None
    source_id: UUID | None = None
    suggested_action: str | None = None
    impact_score: float | None = None


class StrategySummary(BaseModel):
    narrative: str
    focus_areas: list[str] = Field(default_factory=list)
    forecast: str
    health_score: float | None = None


class StrategyOverviewResponse(BaseModel):
    pillars: list[StrategicPillar]
    insights: list[StrategicInsight]
    summary: StrategySummary
    updated_at: datetime


class StrategyRegenerateRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID


class StrategyAskRequest(BaseModel):
    workspace_id: UUID
    user_id: UUID
    question: str


class StrategyAskResponse(BaseModel):
    answer: str
    context_used: dict[str, Any]


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
    marker: str | None = None


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
