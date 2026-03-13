import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import WorkspaceAIProviderCard from "../components/WorkspaceAIProviderCard";
import { USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../constants";
import { useUserRole } from "../context/RoleContext";
import { SECTION_LABEL, BODY_SUBTLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../styles/theme";
import { updateWorkspace } from "../api";

type SettingsScope = "workspace" | "org";

type SettingsPageProps = {
  scope?: SettingsScope;
};

export default function SettingsPage({ scope = "workspace" }: SettingsPageProps) {
  const { workspaceRole } = useUserRole();
  const canAdminWorkspace = workspaceRole === "admin";
  const navigate = useNavigate();
  const isOrgSettings = scope === "org";

  const workspaceContext = useMemo(() => {
    if (typeof window === "undefined") {
      return { id: null, name: null, userId: null };
    }
    const id = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    const name = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
    const userId = window.sessionStorage.getItem(USER_ID_KEY);
    return { id, name, userId };
  }, []);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState(workspaceContext.name);
  const [renameValue, setRenameValue] = useState(workspaceContext.name ?? "");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameMessage, setRenameMessage] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

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

  const headerLabel = isOrgSettings ? "Org settings" : "Workspace settings";
  const headerDescription = isOrgSettings
    ? "Manage tenant-wide AI credentials, guardrails, and billing settings."
    : "Manage workspace AI credentials, guardrails, and billing settings.";

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceContext.id) {
      setRenameError("Select a workspace to rename.");
      return;
    }
    if (!canAdminWorkspace) {
      setRenameError("Only admins can rename the workspace.");
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Workspace name cannot be empty.");
      return;
    }
    if (trimmed === activeWorkspaceName) {
      setRenameMessage("Name unchanged.");
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    setRenameMessage(null);
    try {
      const updated = await updateWorkspace(workspaceContext.id, trimmed);
      setActiveWorkspaceName(updated.name);
      setRenameValue(updated.name);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(WORKSPACE_NAME_KEY, updated.name);
      }
      setRenameMessage("Workspace renamed.");
    } catch (err: any) {
      setRenameError(err.message || "Failed to rename workspace.");
    } finally {
      setRenameLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-10`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>{headerLabel}</p>
            <h1 className="text-3xl font-semibold text-slate-900">AI configuration</h1>
            <p className={BODY_SUBTLE}>{headerDescription}</p>
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
            {isOrgSettings ? (
              workspaceContext.id && (
                <button
                  type="button"
                  onClick={() => handleNavigate(`/workspaces/${workspaceContext.id}/settings`)}
                  className={PRIMARY_BUTTON}
                >
                  Workspace settings
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate("/settings")}
                className={PRIMARY_BUTTON}
              >
                Org settings
              </button>
            )}
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

        {isOrgSettings && workspaceContext.id && (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workspace identity</p>
              <h3 className="text-xl font-semibold text-slate-900">Rename workspace</h3>
              <p className="text-sm text-slate-500">Update the display name used across the tenant for this workspace.</p>
            </div>
            <form className="mt-6 space-y-4" onSubmit={handleRenameSubmit}>
              <div>
                <label htmlFor="workspace-name" className="text-sm font-semibold text-slate-600">
                  Workspace name
                </label>
                <input
                  id="workspace-name"
                  type="text"
                  value={renameValue}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    setRenameError(null);
                    setRenameMessage(null);
                  }}
                  disabled={renameLoading || !canAdminWorkspace}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Workspace name"
                />
                {renameError && <p className="mt-2 text-sm text-rose-600">{renameError}</p>}
                {renameMessage && !renameError && <p className="mt-2 text-sm text-emerald-600">{renameMessage}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className={`${PRIMARY_BUTTON} disabled:opacity-60`}
                  disabled={renameLoading || !canAdminWorkspace}
                >
                  {renameLoading ? "Saving..." : "Save name"}
                </button>
                {!canAdminWorkspace && (
                  <p className="text-sm text-slate-500">Only workspace admins can rename this workspace.</p>
                )}
              </div>
            </form>
          </section>
        )}

        <WorkspaceAIProviderCard
          workspaceId={workspaceContext.id}
          workspaceName={activeWorkspaceName}
          userId={workspaceContext.userId}
          canAdminWorkspace={canAdminWorkspace}
        />
      </div>
    </div>
  );
}
