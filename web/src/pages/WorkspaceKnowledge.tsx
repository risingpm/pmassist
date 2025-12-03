import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import KnowledgeBasePanel from "../components/KnowledgeBasePanel";
import { getProjects } from "../api";
import type { WorkspaceRole } from "../api";
import { USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../constants";
import { useUserRole } from "../context/RoleContext";
import { SECTION_LABEL, BODY_SUBTLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../styles/theme";

type ProjectOption = { id: string; label: string };

export default function WorkspaceKnowledgePage() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const { workspaceRole } = useUserRole();

  const workspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [routeWorkspaceId]);
  const workspaceName = useMemo(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  }, []);
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      setProjectError("Select a workspace to view knowledge.");
      return;
    }
    setLoadingProjects(true);
    getProjects(workspaceId)
      .then((data) => {
        const mapped = (data.projects || []).map((project) => ({
          id: project.id,
          label: project.title,
        }));
        setProjects(mapped);
        setProjectError(null);
      })
      .catch((err) => setProjectError(err instanceof Error ? err.message : "Failed to load projects"))
      .finally(() => setLoadingProjects(false));
  }, [workspaceId]);

  const navItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Knowledge", path: `/workspaces/${workspaceId}/knowledge`, active: true },
      { label: "Templates", path: `/workspaces/${workspaceId}/templates`, active: false },
      { label: "Members", path: `/workspaces/${workspaceId}/projects/members`, active: false },
      { label: "Settings", path: `/workspaces/${workspaceId}/settings`, active: false },
    ];
  }, [workspaceId]);

  const projectOptions = projects;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>Knowledge base</p>
            <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} Knowledge</h1>
            <p className={BODY_SUBTLE}>Upload documents, notes, and insights to power AI copilots across every project.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(workspaceId ? `/workspaces/${workspaceId}/projects` : "/projects")}
              className={SECONDARY_BUTTON}
            >
              Back to workspace
            </button>
            <button
              type="button"
              onClick={() => navigate(workspaceId ? `/workspaces/${workspaceId}/templates` : "/templates")}
              className={PRIMARY_BUTTON}
            >
              Browse templates
            </button>
          </div>
        </header>

        {navItems.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className={`rounded-full px-4 py-2 ${
                  item.active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {projectError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">{projectError}</div>
        )}

        <KnowledgeBasePanel
          workspaceId={workspaceId}
          workspaceRole={workspaceRole as WorkspaceRole}
          userId={userId}
          projectOptions={projectOptions}
        />

        {loadingProjects && (
          <p className="text-sm text-slate-500">Loading project list…</p>
        )}
      </div>
    </div>
  );
}
