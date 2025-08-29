// Base API URL: configurable via Vite environment variables
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

// Helper: handle responses & errors
async function handleResponse(res: Response) {
  if (!res.ok) {
    let errorMsg;
    try {
      errorMsg = await res.text();
    } catch {
      errorMsg = "API request failed";
    }
    throw new Error(`${res.status}: ${errorMsg}`);
  }
  return res.json();
}

// -----------------------------
// CRUD Functions
// -----------------------------

// Create project
export async function createProject(project: {
  title: string;
  description: string;
  goals: string;
}) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  return handleResponse(res);
}

// Get all projects
export async function getProjects() {
  const res = await fetch(`${API_BASE}/projects`);
  return handleResponse(res);
}

// Update a project
export async function updateProject(
  id: string,
  project: { title: string; description: string; goals: string }
) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  return handleResponse(res);
}

// Delete a project
export async function deleteProject(id: string) {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}
