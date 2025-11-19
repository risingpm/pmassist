import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ProjectRole, WorkspaceRole } from "../api";
import { getProjectRole as fetchProjectRole, getWorkspaceMembers } from "../api";
import { WORKSPACE_ROLE_KEY } from "../constants";
import { normalizeProjectRole, normalizeWorkspaceRole } from "../utils/roles";

interface RoleContextValue {
  workspaceRole: WorkspaceRole;
  setWorkspaceRole: (role: WorkspaceRole) => void;
  projectRoles: Record<string, ProjectRole>;
  setProjectRole: (projectId: string, role: ProjectRole) => void;
  refreshWorkspaceRole: (workspaceId: string, userId: string) => Promise<WorkspaceRole>;
  refreshProjectRole: (projectId: string, workspaceId: string, userId: string) => Promise<ProjectRole>;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [workspaceRole, setWorkspaceRoleState] = useState<WorkspaceRole>(() => {
    if (typeof window === "undefined") return "viewer";
    const stored = window.sessionStorage.getItem(WORKSPACE_ROLE_KEY);
    return normalizeWorkspaceRole(stored);
  });
  const [projectRoles, setProjectRoles] = useState<Record<string, ProjectRole>>({});

  const setWorkspaceRole = useCallback((role: WorkspaceRole) => {
    setWorkspaceRoleState(role);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ROLE_KEY, role);
    }
  }, []);

  const setProjectRole = useCallback((projectId: string, role: ProjectRole) => {
    setProjectRoles((prev) => ({ ...prev, [projectId]: role }));
  }, []);

  const refreshWorkspaceRole = useCallback(async (workspaceId: string, userId: string) => {
    const members = await getWorkspaceMembers(workspaceId, userId);
    const current = members.find((member) => member.user_id === userId);
    const role = normalizeWorkspaceRole(current?.role);
    setWorkspaceRole(role);
    return role;
  }, [setWorkspaceRole]);

  const refreshProjectRole = useCallback(
    async (projectId: string, workspaceId: string, userId: string) => {
      const fresh = normalizeProjectRole(await fetchProjectRole(projectId, workspaceId, userId));
      setProjectRole(projectId, fresh);
      return fresh;
    },
    [setProjectRole]
  );

  const value = useMemo(
    () => ({ workspaceRole, setWorkspaceRole, projectRoles, setProjectRole, refreshWorkspaceRole, refreshProjectRole }),
    [workspaceRole, setWorkspaceRole, projectRoles, setProjectRole, refreshWorkspaceRole, refreshProjectRole]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useUserRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useUserRole must be used within a RoleProvider");
  }
  return ctx;
}
