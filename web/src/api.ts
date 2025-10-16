const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RoadmapGenerateResponse = {
  message: string;
  conversation_history: ChatMessage[];
  roadmap?: string | null;
};

// ---------------- Projects ----------------
export async function getProjects() {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getProject(id: string) {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: { title: string; description: string; goals: string; north_star_metric?: string | null }) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(id: string, data: { title: string; description: string; goals: string; north_star_metric?: string | null }) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deleteProject(id: string) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

// ---------------- Roadmap ----------------
export async function fetchRoadmap(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap`);
  if (!res.ok) throw new Error("Failed to fetch roadmap");
  return res.json();
}

export async function generateRoadmapChat(
  projectId: string,
  prompt: string,
  conversation: ChatMessage[]
): Promise<RoadmapGenerateResponse> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, conversation_history: conversation }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to generate roadmap");
  }
  return res.json();
}

export async function updateRoadmap(projectId: string, content: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/roadmap`, {
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
export async function createPrd(projectId: string, body: { feature_name: string; prompt: string }) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create PRD");
  return res.json();
}

export async function getPrds(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds`);
  if (!res.ok) throw new Error("Failed to fetch PRDs");
  return res.json();
}

export async function getPrd(projectId: string, prdId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}`);
  if (!res.ok) throw new Error("Failed to fetch PRD");
  return res.json();
}

export async function refinePrd(projectId: string, prdId: string, instructions: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}/refine`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instructions })
  });
  if (!res.ok) throw new Error("Failed to refine PRD");
  const data = await res.json();
  return data.content;
}

export async function deletePrd(projectId: string, prdId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete PRD");
}

export async function exportPrd(projectId: string, prdId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/prds/${prdId}/export`);
  if (!res.ok) throw new Error("Failed to export PRD");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PRD_${prdId}.docx`;
  a.click();
}
