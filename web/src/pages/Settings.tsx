import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import WorkspaceAIProviderCard from "../components/WorkspaceAIProviderCard";
import { USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../constants";
import { useUserRole } from "../context/RoleContext";
import { SECTION_LABEL, BODY_SUBTLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../styles/theme";

export default function SettingsPage() {
  const { workspaceRole } = useUserRole();
  const canAdminWorkspace = workspaceRole === "admin";
  const navigate = useNavigate();

  const workspaceContext = useMemo(() => {
    if (typeof window === "undefined") {
      return { id: null, name: null, userId: null };
    }
    const id = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    const name = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
    const userId = window.sessionStorage.getItem(USER_ID_KEY);
    return { id, name, userId };
  }, []);

  const navItems = useMemo(() => {
    if (!workspaceContext.id) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceContext.id}/dashboard`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceContext.id}/projects`, active: false },
      { label: "Knowledge", path: `/workspaces/${workspaceContext.id}/knowledge`, active: false },
      { label: "Templates", path: `/workspaces/${workspaceContext.id}/templates`, active: false },
      { label: "Members", path: `/workspaces/${workspaceContext.id}/projects/members`, active: false },
      { label: "Settings", path: `/workspaces/${workspaceContext.id}/settings`, active: true },
    ];
  }, [workspaceContext.id]);
  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-10`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>Workspace settings</p>
            <h1 className="text-3xl font-semibold text-slate-900">AI configuration</h1>
            <p className={BODY_SUBTLE}>Manage tenant-wide AI credentials, guardrails, and billing settings.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                workspaceContext.id ? handleNavigate(`/workspaces/${workspaceContext.id}/projects`) : handleNavigate("/projects")
              }
              className={SECONDARY_BUTTON}
            >
              Back to workspace
            </button>
            <button
              type="button"
              onClick={() => handleNavigate("/settings")}
              className={PRIMARY_BUTTON}
            >
              Org settings
            </button>
          </div>
        </header>

        {navItems.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNavigate(item.path)}
                className={`rounded-full px-4 py-2 ${
                  item.active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <WorkspaceAIProviderCard
          workspaceId={workspaceContext.id}
          workspaceName={workspaceContext.name}
          userId={workspaceContext.userId}
          canAdminWorkspace={canAdminWorkspace}
        />
      </div>
    </div>
  );
}
