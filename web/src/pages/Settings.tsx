import { useMemo } from "react";

import WorkspaceAIProviderCard from "../components/WorkspaceAIProviderCard";
import { USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";
import { useUserRole } from "../context/RoleContext";
import WorkspaceBackLinks from "../components/WorkspaceBackLinks";

export default function SettingsPage() {
  const { workspaceRole } = useUserRole();
  const canAdminWorkspace = workspaceRole === "admin";

  const workspaceContext = useMemo(() => {
    if (typeof window === "undefined") {
      return { id: null, name: null, userId: null };
    }
    const id = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    const name = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
    const userId = window.sessionStorage.getItem(USER_ID_KEY);
    return { id, name, userId };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <WorkspaceBackLinks
          links={[
            {
              to: workspaceContext.id ? `/workspaces/${workspaceContext.id}/projects` : "/projects",
              label: "Back to workspace",
            },
          ]}
        />
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Settings</p>
          <h1 className="text-3xl font-semibold text-slate-900">Workspace AI configuration</h1>
          <p className="text-sm text-slate-500">
            Manage the tenant-wide OpenAI credentials used by your assistant across all modules.
          </p>
        </header>

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
