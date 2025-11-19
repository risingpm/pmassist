import type { ProjectRole, WorkspaceRole } from "../api";

const WORKSPACE_DEFAULT: WorkspaceRole = "viewer";
const PROJECT_DEFAULT: ProjectRole = "viewer";

export const normalizeWorkspaceRole = (value?: string | null): WorkspaceRole => {
  if (!value) return WORKSPACE_DEFAULT;
  const lowered = value.toLowerCase();
  if (lowered === "admin" || lowered === "editor" || lowered === "viewer") {
    return lowered;
  }
  if (lowered === "owner") return "admin";
  if (lowered === "member") return "editor";
  return WORKSPACE_DEFAULT;
};

export const normalizeProjectRole = (value?: string | null): ProjectRole => {
  if (!value) return PROJECT_DEFAULT;
  const lowered = value.toLowerCase();
  if (lowered === "owner" || lowered === "contributor" || lowered === "viewer") {
    return lowered;
  }
  if (lowered === "admin") return "owner";
  if (lowered === "editor") return "contributor";
  return PROJECT_DEFAULT;
};
