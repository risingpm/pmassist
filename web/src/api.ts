export async function getProjects() {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getProject(id: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects/${id}`);
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: { title: string; description: string; goals: string }) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(id: string, data: { title: string; description: string; goals: string }) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deleteProject(id: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

export async function generateRoadmap(projectId: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects/${projectId}/roadmap`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to generate roadmap");
  return res.json();
}

export async function getRoadmap(projectId: string) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/projects/${projectId}/roadmap`);
  if (!res.ok) throw new Error("Failed to fetch roadmap");
  return res.json();
}
