import { USER_ID_KEY } from "./constants";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export type WorkspaceRole = "admin" | "editor" | "viewer";
export type ProjectRole = "owner" | "contributor" | "viewer";
export type KnowledgeBaseEntryType = "document" | "prd" | "insight" | "research" | "repo" | "ai_output";

const MISSING_USER_ERROR = "User session missing. Please sign in again.";

function resolveUserId(explicit?: string | null): string {
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(USER_ID_KEY);
    if (stored) return stored;
  }
  throw new Error(MISSING_USER_ERROR);
}

function buildWorkspaceQuery(
  workspaceId: string,
  userId?: string | null,
  extra?: Record<string, string | undefined>
) {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  params.set("user_id", resolveUserId(userId));
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (typeof value === "string") {
        params.set(key, value);
      }
    });
  }
  return params.toString();
}

function workspaceUrl(
  path: string,
  workspaceId: string,
  userId?: string | null,
  extra?: Record<string, string | undefined>
) {
  const query = buildWorkspaceQuery(workspaceId, userId, extra);
  return `${path}?${query}`;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type UserAgent = {
  id: string;
  user_id: string;
  name: string;
  personality: string | null;
  focus_areas: string[];
  integrations: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserAgentPayload = {
  name: string;
  personality?: string | null;
  focus_areas: string[];
  integrations: Record<string, unknown>;
};

export type AuthPayload = {
  email: string;
  password: string;
};

export type GoogleAuthPayload = {
  credential: string;
};

export type AuthResponse = {
  id: string;
  email: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  workspace_role?: WorkspaceRole | null;
};

export type ForgotPasswordResponse = {
  reset_token: string;
  expires_at: string;
};

export type KnowledgeBaseContextItem = {
  id: string;
  title: string;
  type: KnowledgeBaseEntryType;
  snippet: string;
};

export type KnowledgeBase = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  created_at: string;
};

export type KnowledgeBaseEntry = {
  id: string;
  kb_id: string;
  type: KnowledgeBaseEntryType;
  title: string;
  content?: string | null;
  file_url?: string | null;
  source_url?: string | null;
  created_by?: string | null;
  created_by_email?: string | null;
  project_id?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type KnowledgeSearchResult = {
  id: string;
  content?: string | null;
  uploaded_at: string;
  title?: string | null;
  type: KnowledgeBaseEntryType;
  project_id?: string | null;
  tags?: string[];
};

export type KnowledgeBaseEntryPayload = {
  type: KnowledgeBaseEntryType;
  title: string;
  content?: string | null;
  source_url?: string | null;
  project_id?: string | null;
  tags?: string[];
};

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type TaskRecord = {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  epic_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
  roadmap_id?: string | null;
  kb_entry_id?: string | null;
  prd_id?: string | null;
  ai_generated: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskPayload = {
  project_id?: string | null;
  epic_id?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
  roadmap_id?: string | null;
  kb_entry_id?: string | null;
  prd_id?: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id?: string | null;
  content: string;
  created_at: string;
};

export type TaskGenerationItem = {
  title: string;
  description: string;
  priority: TaskPriority;
  effort?: string | null;
  status: TaskStatus;
};

export type PRDRecord = {
  id: string;
  project_id: string;
  feature_name?: string | null;
  description?: string | null;
  goals?: string | null;
  content?: string | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  workspace_id?: string | null;
  context_entries?: KnowledgeBaseContextItem[] | null;
};

export type RoadmapGenerateResponse = {
  message: string;
  conversation_history: ChatMessage[];
  roadmap?: string | null;
  action: "ask_followup" | "present_roadmap";
  suggestions?: string[] | null;
  context_entries?: KnowledgeBaseContextItem[] | null;
};

export type ProjectComment = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  author_id: string | null;
  content: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCommentPayload = {
  content: string;
  tags?: string[];
  author_id?: string | null;
};

export type PrototypeComponent = {
  kind: string;
  title?: string | null;
  description?: string | null;
  actions?: string[];
  sample_items?: string[] | null;
  dataset?: Array<Record<string, unknown>> | null;
  fields?: string[] | null;
};

export type PrototypeScreen = {
  name: string;
  goal: string;
  primary_actions: string[];
  layout_notes?: string | null;
  components?: PrototypeComponent[];
};

export type PrototypeSpec = {
  title: string;
  summary: string;
  goal?: string | null;
  key_screens: PrototypeScreen[];
  user_flow?: string[] | null;
  visual_style?: string | null;
  call_to_action?: string | null;
  success_metrics?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type Prototype = {
  id: string;
  project_id: string;
  roadmap_id?: string | null;
  roadmap_version?: number | null;
  phase?: string | null;
  title: string;
  summary: string;
  spec: PrototypeSpec;
  html_preview?: string | null;
  bundle_url?: string | null;
  workspace_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectLink = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  label: string;
  url: string;
  description?: string | null;
  tags?: string[] | null;
  created_at: string;
};

export type PrototypeAgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type PrototypeSession = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  latest_spec?: PrototypeSpec | null;
  bundle_url?: string | null;
  messages: PrototypeAgentMessage[];
};

export type GitHubRepoContextEntry = {
  id: string;
  repo_id: string;
  file_path: string;
  content_summary: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type GitHubRepoInsight = {
  id: string;
  repo_id: string;
  project_id?: string | null;
  strategic_pillars?: Array<string | Record<string, unknown>> | null;
  roadmap?: Record<string, unknown> | null;
  prd_drafts?: Array<Record<string, unknown>> | null;
  created_at: string;
};

export type GitHubRepoRecord = {
  id: string;
  connection_id: string;
  workspace_id: string;
  repo_name: string;
  repo_full_name: string;
  repo_url: string;
  default_branch?: string | null;
  last_synced?: string | null;
  metadata?: Record<string, unknown> | null;
  contexts: GitHubRepoContextEntry[];
  insights: GitHubRepoInsight[];
};

export type GitHubConnectionRecord = {
  id: string;
  user_id: string;
  workspace_id: string;
  username?: string | null;
  provider: string;
  created_at: string;
  repos: GitHubRepoRecord[];
};

export type KnowledgeEntryRecord = {
  id: string;
  workspace_id: string;
  repo_id?: string | null;
  project_id?: string | null;
  source: string;
  entry_type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type GitHubWorkspaceContext = {
  connections: GitHubConnectionRecord[];
  knowledge_entries: KnowledgeEntryRecord[];
};

export type WorkspaceMember = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: WorkspaceRole;
  joined_at: string;
};

export type ProjectMember = {
  id: string | null;
  project_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: ProjectRole;
  inherited: boolean;
  joined_at?: string | null;
};

export type WorkspaceInvitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invited_by?: string | null;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  cancelled_at?: string | null;
};

export type GitHubProjectContext = {
  repo: GitHubRepoRecord | null;
  available_repos: GitHubRepoRecord[];
  knowledge_entries: KnowledgeEntryRecord[];
};

export type RoadmapChatSession = {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  user_id?: string | null;
  messages: ChatMessage[];
  output_entry_id?: string | null;
  created_at: string;
};

export type RoadmapChatTurnResponse = RoadmapChatSession & {
  assistant_message: string;
  roadmap?: string | null;
  context_entries?: KnowledgeBaseContextItem[] | null;
  action: "ask_followup" | "present_roadmap";
  suggestions?: string[] | null;
  kb_entry_id?: string | null;
};

export type BuilderChatResponse = {
  message: string;
  code: string;
  design_tokens: Record<string, any>;
  context_entries?: KnowledgeBaseContextItem[] | null;
  suggestions?: string[] | null;
};

export type BuilderPreviewResponse = {
  preview_html: string;
};

export type BuilderPrototypeRecord = {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  title: string;
  prompt: string;
  code: string;
  preview_html?: string | null;
  design_tokens?: Record<string, any> | null;
  created_by?: string | null;
  created_at: string;
};

export type TaskGenerationResponse = {
  tasks: TaskGenerationItem[];
  context_entries?: KnowledgeBaseContextItem[] | null;
};

export async function startGitHubAuth(workspaceId: string, userId: string, redirectOverride?: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId, user_id: userId });
  if (redirectOverride) {
    params.set("redirect_override", redirectOverride);
  }
  const res = await fetch(`${API_BASE}/integrations/github/auth?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to initiate GitHub OAuth");
  return res.json() as Promise<{ authorize_url: string; state: string }>;
}

export async function fetchUserRepos(workspaceId: string, userId: string) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/integrations/github/repos?${params}`);
  if (!res.ok) throw new Error("Failed to load GitHub repositories");
  return res.json() as Promise<{
    available_repos: Array<Record<string, unknown>>;
    connected_repos: GitHubRepoRecord[];
    username?: string | null;
  }>;
}

export async function syncGitHubRepo(
  workspaceId: string,
  userId: string,
  payload: { repo_full_name: string; branch?: string | null; force?: boolean }
) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/integrations/github/sync?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || "Failed to sync repository");
  }
  return res.json() as Promise<GitHubRepoRecord>;
}

export async function getGitHubContext(workspaceId: string, userId?: string | null) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/integrations/github/context`, workspaceId, userId)
  );
  if (!res.ok) throw new Error("Failed to load GitHub context");
  return res.json() as Promise<GitHubWorkspaceContext>;
}

export async function getProjectGitHubContext(projectId: string, workspaceId: string, userId?: string | null) {
  const res = await fetch(
    workspaceUrl(
      `${API_BASE}/integrations/github/projects/${projectId}/context`,
      workspaceId,
      userId
    )
  );
  if (!res.ok) throw new Error("Failed to load project GitHub context");
  return res.json() as Promise<GitHubProjectContext>;
}

export async function linkProjectGitHubRepo(projectId: string, workspaceId: string, repoId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/integrations/github/projects/${projectId}/link`, workspaceId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to link repository");
  }
  return res.json() as Promise<GitHubProjectContext>;
}

export async function unlinkProjectGitHubRepo(projectId: string, workspaceId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/integrations/github/projects/${projectId}/link`, workspaceId),
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to unlink repository");
  }
  return res.json() as Promise<GitHubProjectContext>;
}

// ---------------- Projects ----------------
export async function getProjects(workspaceId: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getProject(id: string, workspaceId: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${id}`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: {
  title: string;
  description: string;
  goals: string;
  north_star_metric?: string | null;
  target_personas?: string[] | null;
  workspace_id: string;
}) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects`, data.workspace_id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(
  id: string,
  data: {
    title: string;
    description: string;
    goals: string;
    north_star_metric?: string | null;
    target_personas?: string[];
    workspace_id: string;
  }
) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${id}`, data.workspace_id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deleteProject(id: string, workspaceId: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${id}`, workspaceId), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

// ---------------- Roadmap ----------------
export async function fetchRoadmap(projectId: string, workspaceId: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/roadmap`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch roadmap");
  return res.json();
}

export async function generateRoadmapChat(
  projectId: string,
  prompt: string,
  conversation: ChatMessage[],
  userId?: string | null,
  workspaceId?: string
): Promise<RoadmapGenerateResponse> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      conversation_history: conversation,
      user_id: userId ?? null,
      workspace_id: workspaceId ?? null,
    }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to generate roadmap");
  }
  return res.json();
}

export async function sendRoadmapChatTurn(payload: {
  workspace_id: string;
  project_id: string;
  prompt: string;
  chat_id?: string | null;
  user_id?: string | null;
}): Promise<RoadmapChatTurnResponse> {
  const res = await fetch(`${API_BASE}/chat/roadmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      user_id: payload.user_id ?? resolveUserId(),
    }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to process roadmap chat");
  }
  return res.json();
}

export async function builderChat(payload: {
  workspace_id: string;
  user_id: string;
  prompt: string;
  project_id?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<BuilderChatResponse> {
  const res = await fetch(`${API_BASE}/builder/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      history: payload.history ?? [],
    }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Builder chat failed");
  }
  return res.json();
}

export async function builderPreview(code: string): Promise<BuilderPreviewResponse> {
  const res = await fetch(`${API_BASE}/builder/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Preview generation failed");
  }
  return res.json();
}

export async function builderSavePrototype(payload: {
  workspace_id: string;
  user_id: string;
  title: string;
  prompt: string;
  code: string;
  preview_html: string;
  project_id?: string | null;
  design_tokens?: Record<string, any>;
}): Promise<BuilderPrototypeRecord> {
  const res = await fetch(`${API_BASE}/builder/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to save prototype");
  }
  return res.json();
}

export async function listBuilderPrototypes(workspaceId: string, userId: string): Promise<BuilderPrototypeRecord[]> {
  const res = await fetch(`${API_BASE}/builder/${workspaceId}/list?${new URLSearchParams({ user_id: userId }).toString()}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to load prototypes");
  }
  return res.json();
}

export async function listTasks(
  workspaceId: string,
  userId: string,
  projectId?: string
): Promise<TaskRecord[]> {
  const params = buildWorkspaceQuery(workspaceId, userId, projectId ? { project_id: projectId } : undefined);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/tasks?${params}`);
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

export async function createTask(
  workspaceId: string,
  userId: string,
  payload: TaskPayload
): Promise<TaskRecord> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/tasks?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to create task");
  }
  return res.json();
}

export async function updateTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  payload: Partial<TaskPayload>
): Promise<TaskRecord> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/tasks/${taskId}?${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to update task");
  }
  return res.json();
}

export async function deleteTask(taskId: string, workspaceId: string, userId: string) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/tasks/${taskId}?${params}`, { method: "DELETE" });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to delete task");
  }
}

export async function listTaskComments(taskId: string, workspaceId: string, userId: string): Promise<TaskComment[]> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/tasks/${taskId}/comments?${params}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to load task comments");
  }
  return res.json();
}

export async function addTaskComment(
  taskId: string,
  workspaceId: string,
  userId: string,
  content: string
): Promise<TaskComment> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/tasks/${taskId}/comments?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to add comment");
  }
  return res.json();
}

export async function generateTasksFromAI(payload: {
  workspace_id: string;
  project_id: string;
  user_id: string;
  prd_id?: string | null;
  roadmap_id?: string | null;
  instructions?: string | null;
}): Promise<TaskGenerationResponse> {
  const res = await fetch(`${API_BASE}/ai/generate-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to generate tasks");
  }
  return res.json();
}
export async function updateRoadmap(projectId: string, workspaceId: string, content: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/roadmap`, workspaceId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to update roadmap");
  }
  return res.json();
}

// ---------------- PRDs ----------------
export async function createPrd(
  projectId: string,
  workspaceId: string,
  body: { feature_name: string; prompt: string }
): Promise<PRDRecord> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prd`, workspaceId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create PRD");
  return res.json();
}

export async function getPrds(projectId: string, workspaceId: string): Promise<PRDRecord[]> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prds`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch PRDs");
  return res.json();
}

export async function getPrd(projectId: string, prdId: string, workspaceId: string): Promise<PRDRecord> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prds/${prdId}`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch PRD");
  return res.json();
}

export async function refinePrd(
  projectId: string,
  prdId: string,
  workspaceId: string,
  instructions: string
): Promise<PRDRecord> {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/prds/${prdId}/refine`, workspaceId),
    {
      method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instructions })
  });
  if (!res.ok) throw new Error("Failed to refine PRD");
  return res.json();
}

export async function deletePrd(projectId: string, prdId: string, workspaceId: string) {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prds/${prdId}`, workspaceId), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete PRD");
}

export async function exportPrd(projectId: string, prdId: string, workspaceId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/prds/${prdId}/export`, workspaceId)
  );
  if (!res.ok) throw new Error("Failed to export PRD");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PRD_${prdId}.docx`;
  a.click();
}

// ---------------- Project Comments ----------------
export async function getProjectComments(projectId: string, workspaceId: string): Promise<ProjectComment[]> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/comments`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch project comments");
  return res.json();
}

export async function createProjectComment(
  projectId: string,
  workspaceId: string,
  payload: ProjectCommentPayload
): Promise<ProjectComment> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/comments`, workspaceId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create project comment");
  return res.json();
}

export async function updateProjectComment(
  projectId: string,
  workspaceId: string,
  commentId: string,
  payload: Partial<ProjectCommentPayload>
): Promise<ProjectComment> {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/comments/${commentId}`, workspaceId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error("Failed to update project comment");
  return res.json();
}

export async function deleteProjectComment(projectId: string, workspaceId: string, commentId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/comments/${commentId}`, workspaceId),
    {
      method: "DELETE",
    }
  );
  if (!res.ok) throw new Error("Failed to delete project comment");
  return res.json();
}

// ---------------- Prototypes ----------------
export async function getPrototypes(projectId: string, workspaceId: string): Promise<Prototype[]> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prototypes`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch prototypes");
  return res.json();
}

export async function generatePrototype(
  projectId: string,
  workspaceId: string,
  payload: { phase?: string; focus?: string; count?: number }
): Promise<Prototype> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/prototypes`, workspaceId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      phase: payload.phase ?? null,
      focus: payload.focus ?? null,
      count: payload.count ?? 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate prototype");
  }
  return res.json();
}

export async function generatePrototypeBatch(
  projectId: string,
  workspaceId: string,
  payload: { phase?: string; focus?: string; count: number }
): Promise<Prototype[]> {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/prototypes/batch`, workspaceId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        phase: payload.phase ?? null,
        focus: payload.focus ?? null,
        count: payload.count,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate prototype batch");
  }
  return res.json();
}

export async function deletePrototype(projectId: string, workspaceId: string, prototypeId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/prototypes/${prototypeId}`, workspaceId),
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete prototype");
  }
  return res.json();
}

export async function deleteAllPrototypes(
  projectId: string,
  workspaceId: string,
  includeSessions = true
): Promise<{ deleted_prototypes: number; deleted_sessions: number }> {
  const url = workspaceUrl(
    `${API_BASE}/projects/${projectId}/prototypes`,
    workspaceId,
    undefined,
    { include_sessions: includeSessions ? "true" : "false" }
  );
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete prototypes");
  }
  return res.json();
}

// ---------------- Project Links ----------------
export async function getProjectLinks(projectId: string, workspaceId: string): Promise<ProjectLink[]> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/links`, workspaceId));
  if (!res.ok) throw new Error("Failed to fetch project links");
  return res.json();
}

export async function createProjectLink(
  projectId: string,
  payload: { label: string; url: string; description?: string; tags?: string[]; workspace_id: string }
): Promise<ProjectLink> {
  const res = await fetch(workspaceUrl(`${API_BASE}/projects/${projectId}/links`, payload.workspace_id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create project link");
  }
  return res.json();
}

export async function deleteProjectLink(projectId: string, workspaceId: string, linkId: string) {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/links/${linkId}`, workspaceId),
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete project link");
  }
  return res.json();
}

// ---------------- Prototype Agent Sessions ----------------
export async function getPrototypeSessions(projectId: string, workspaceId: string): Promise<PrototypeSession[]> {
  const res = await fetch(
    workspaceUrl(`${API_BASE}/projects/${projectId}/prototype-sessions`, workspaceId)
  );
  if (!res.ok) throw new Error("Failed to fetch prototype sessions");
  return res.json();
}

export async function createPrototypeSession(
  projectId: string,
  workspaceId: string,
  prompt?: string
): Promise<PrototypeSession> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototype-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId, prompt: prompt ?? null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to start prototype session");
  }
  return res.json();
}

export async function sendPrototypeAgentMessage(
  projectId: string,
  sessionId: string,
  workspaceId: string,
  message: string
): Promise<PrototypeSession> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototype-sessions/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to send agent message");
  }
  return res.json();
}

// ---------------- User Agents ----------------
export async function getUserAgent(userId: string): Promise<UserAgent | null> {
  const res = await fetch(`${API_BASE}/users/${userId}/agent`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch agent");
  return res.json();
}

export async function createUserAgent(userId: string, payload: UserAgentPayload) {
  const res = await fetch(`${API_BASE}/users/${userId}/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create agent");
  }
  return res.json();
}

export async function updateUserAgent(userId: string, payload: UserAgentPayload) {
  const res = await fetch(`${API_BASE}/users/${userId}/agent`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update agent");
  }
  return res.json();
}

// ---------------- Auth ----------------
export async function signup(payload: AuthPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to sign up");
  }
  return res.json();
}

export async function login(payload: AuthPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to sign in");
  }
  return res.json();
}

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to sign in with Google");
  }
  return res.json();
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
  } catch (err) {
    console.warn("Logout request failed", err);
  }
}

// ---------------- Workspaces ----------------
export type WorkspaceSummary = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role?: WorkspaceRole | null;
};

export async function getUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const res = await fetch(`${API_BASE}/users/${userId}/workspaces`);
  if (!res.ok) throw new Error("Failed to fetch workspaces");
  return res.json();
}

export async function createWorkspace(payload: { name: string; owner_id: string }) {
  const res = await fetch(`${API_BASE}/workspaces?owner_id=${payload.owner_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: payload.name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create workspace");
  }
  return res.json();
}

export async function updateWorkspace(workspaceId: string, name: string) {
  const params = new URLSearchParams();
  params.set("user_id", resolveUserId());
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}?${params.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to rename workspace");
  }
  return res.json();
}

export async function getWorkspaceMembers(workspaceId: string, userId?: string | null): Promise<WorkspaceMember[]> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members?${params}`);
  if (!res.ok) throw new Error("Failed to load workspace members");
  return res.json();
}

export async function getWorkspaceInvitations(
  workspaceId: string,
  userId?: string | null
): Promise<WorkspaceInvitation[]> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/invitations?${params}`);
  if (!res.ok) throw new Error("Failed to load invitations");
  return res.json();
}

// ---------------- Knowledge Base ----------------
export async function getKnowledgeBase(workspaceId: string, userId?: string | null): Promise<KnowledgeBase> {
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/workspaces/${workspaceId}`, workspaceId, userId));
  if (!res.ok) throw new Error("Failed to load knowledge base");
  return res.json();
}

export async function listKnowledgeBaseEntries(
  workspaceId: string,
  filters: {
    type?: KnowledgeBaseEntryType;
    search?: string;
    limit?: number;
    projectId?: string;
    tag?: string;
  } = {},
  userId?: string | null
): Promise<KnowledgeBaseEntry[]> {
  const extra: Record<string, string | undefined> = {};
  if (filters.type) extra.type = filters.type;
  if (filters.search) extra.search = filters.search;
  if (filters.limit) extra.limit = String(filters.limit);
  if (filters.projectId) extra.project_id = filters.projectId;
  if (filters.tag) extra.tag = filters.tag;
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/workspaces/${workspaceId}/entries`, workspaceId, userId, extra));
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to load knowledge base entries");
  }
  return res.json();
}

export async function createKnowledgeBaseEntry(
  workspaceId: string,
  payload: KnowledgeBaseEntryPayload,
  userId?: string | null
): Promise<KnowledgeBaseEntry> {
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/workspaces/${workspaceId}/entries`, workspaceId, userId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to create knowledge base entry");
  }
  return res.json();
}

export async function uploadKnowledgeBaseEntry(
  workspaceId: string,
  data: FormData,
  userId?: string | null
): Promise<KnowledgeBaseEntry> {
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/workspaces/${workspaceId}/entries/upload`, workspaceId, userId), {
    method: "POST",
    body: data,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to upload entry");
  }
  return res.json();
}

export async function updateKnowledgeBaseEntry(
  workspaceId: string,
  entryId: string,
  payload: Partial<KnowledgeBaseEntryPayload>,
  userId?: string | null
): Promise<KnowledgeBaseEntry> {
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/entries/${entryId}`, workspaceId, userId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to update entry");
  }
  return res.json();
}

export async function deleteKnowledgeBaseEntry(workspaceId: string, entryId: string, userId?: string | null) {
  const res = await fetch(workspaceUrl(`${API_BASE}/knowledge-base/entries/${entryId}`, workspaceId, userId), {
    method: "DELETE",
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to delete entry");
  }
}

export async function searchKnowledgeBase(
  workspaceId: string,
  query: string,
  entryType?: KnowledgeBaseEntryType,
  userId?: string | null,
  projectId?: string | null
): Promise<KnowledgeSearchResult[]> {
  const extra: Record<string, string | undefined> = {};
  if (entryType) extra.entry_type = entryType;
  if (projectId) extra.project_id = projectId;
  const params = buildWorkspaceQuery(workspaceId, userId, { query, ...extra });
  const res = await fetch(`${API_BASE}/knowledge/search/${workspaceId}?${params}`);
  if (!res.ok) throw new Error("Failed to search knowledge base");
  return res.json();
}

export function knowledgeEntryDownloadUrl(workspaceId: string, entryId: string, userId?: string | null) {
  return workspaceUrl(`${API_BASE}/knowledge-base/entries/${entryId}/download`, workspaceId, userId ?? undefined);
}

export async function getProjectMembers(
  projectId: string,
  workspaceId: string,
  userId?: string | null
): Promise<ProjectMember[]> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/projects/${projectId}/members?${params}`);
  if (!res.ok) throw new Error("Failed to load project members");
  return res.json();
}

export async function addProjectMember(
  projectId: string,
  workspaceId: string,
  payload: { user_id: string; role: ProjectRole },
  userId?: string | null
) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/projects/${projectId}/members?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to invite project member");
  }
  return res.json() as Promise<ProjectMember>;
}

export async function updateProjectMemberRole(
  projectId: string,
  memberId: string,
  workspaceId: string,
  role: ProjectRole,
  userId?: string | null
) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/projects/${projectId}/members/${memberId}?${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update project member");
  }
  return res.json() as Promise<ProjectMember>;
}

export async function removeProjectMember(
  projectId: string,
  memberId: string,
  workspaceId: string,
  userId?: string | null
) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/projects/${projectId}/members/${memberId}?${params}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to remove project member");
  }
}

export async function getProjectRole(
  projectId: string,
  workspaceId: string,
  userId?: string | null
): Promise<ProjectRole> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/projects/${projectId}/membership?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to load project role");
  }
  const body = await res.json();
  return (body.role || "viewer") as ProjectRole;
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  payload: { email: string; role?: WorkspaceRole },
  userId?: string | null
): Promise<WorkspaceInvitation> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/invite?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: payload.email, role: payload.role ?? "viewer" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to send invitation");
  }
  return res.json();
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
  userId?: string | null
): Promise<WorkspaceMember> {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members/${memberId}?${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update member role");
  }
  return res.json();
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
  userId?: string | null
) {
  const params = buildWorkspaceQuery(workspaceId, userId);
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/members/${memberId}?${params}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to remove member");
  }
}

export async function acceptWorkspaceInvitation(token: string, userId: string) {
  const res = await fetch(`${API_BASE}/workspaces/invitations/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to accept invitation");
  }
  return res.json();
}

// ---------------- Password reset ----------------
export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to request password reset");
  }
  return res.json();
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to reset password");
  }
  return res.json();
}
