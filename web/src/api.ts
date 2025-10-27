export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

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

export type AuthResponse = {
  id: string;
  email: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

export type ForgotPasswordResponse = {
  reset_token: string;
  expires_at: string;
};

export type RoadmapGenerateResponse = {
  message: string;
  conversation_history: ChatMessage[];
  roadmap?: string | null;
  action: "ask_followup" | "present_roadmap";
  suggestions?: string[] | null;
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

// ---------------- Projects ----------------
export async function getProjects(workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getProject(id: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${id}?workspace_id=${workspaceId}`);
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
  const res = await fetch(`${API_BASE}/projects`, {
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
  const res = await fetch(`${API_BASE}/projects/${id}?workspace_id=${data.workspace_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deleteProject(id: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${id}?workspace_id=${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

// ---------------- Roadmap ----------------
export async function fetchRoadmap(projectId: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap?workspace_id=${workspaceId}`);
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

export async function updateRoadmap(projectId: string, workspaceId: string, content: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap?workspace_id=${workspaceId}`, {
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
export async function createPrd(projectId: string, workspaceId: string, body: { feature_name: string; prompt: string }) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prd?workspace_id=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create PRD");
  return res.json();
}

export async function getPrds(projectId: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch PRDs");
  return res.json();
}

export async function getPrd(projectId: string, prdId: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch PRD");
  return res.json();
}

export async function refinePrd(projectId: string, prdId: string, workspaceId: string, instructions: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}/refine?workspace_id=${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instructions })
  });
  if (!res.ok) throw new Error("Failed to refine PRD");
  const data = await res.json();
  return data.content;
}

export async function deletePrd(projectId: string, prdId: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}?workspace_id=${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete PRD");
}

export async function exportPrd(projectId: string, prdId: string, workspaceId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}/export?workspace_id=${workspaceId}`);
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/comments?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch project comments");
  return res.json();
}

export async function createProjectComment(
  projectId: string,
  workspaceId: string,
  payload: ProjectCommentPayload
): Promise<ProjectComment> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/comments?workspace_id=${workspaceId}`, {
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
    `${API_BASE}/projects/${projectId}/comments/${commentId}?workspace_id=${workspaceId}`,
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
    `${API_BASE}/projects/${projectId}/comments/${commentId}?workspace_id=${workspaceId}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) throw new Error("Failed to delete project comment");
  return res.json();
}

// ---------------- Prototypes ----------------
export async function getPrototypes(projectId: string, workspaceId: string): Promise<Prototype[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototypes?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch prototypes");
  return res.json();
}

export async function generatePrototype(
  projectId: string,
  workspaceId: string,
  payload: { phase?: string; focus?: string; count?: number }
): Promise<Prototype> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototypes`, {
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototypes/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      phase: payload.phase ?? null,
      focus: payload.focus ?? null,
      count: payload.count,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate prototype batch");
  }
  return res.json();
}

export async function deletePrototype(projectId: string, workspaceId: string, prototypeId: string) {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/prototypes/${prototypeId}?workspace_id=${workspaceId}`,
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
  const url = new URL(`${API_BASE}/projects/${projectId}/prototypes`);
  url.searchParams.set("workspace_id", workspaceId);
  url.searchParams.set("include_sessions", includeSessions ? "true" : "false");
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete prototypes");
  }
  return res.json();
}

// ---------------- Project Links ----------------
export async function getProjectLinks(projectId: string, workspaceId: string): Promise<ProjectLink[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/links?workspace_id=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch project links");
  return res.json();
}

export async function createProjectLink(
  projectId: string,
  payload: { label: string; url: string; description?: string; tags?: string[]; workspace_id: string }
): Promise<ProjectLink> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/links`, {
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
    `${API_BASE}/projects/${projectId}/links/${linkId}?workspace_id=${workspaceId}`,
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
  const res = await fetch(`${API_BASE}/projects/${projectId}/prototype-sessions?workspace_id=${workspaceId}`);
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
  const res = await fetch(`${API_BASE}/workspaces/${workspaceId}`, {
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
