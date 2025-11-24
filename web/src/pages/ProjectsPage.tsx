import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import ProjectDetail from "../components/ProjectDetail";
import WorkspaceMembersPanel from "../components/WorkspaceMembersPanel";
import KnowledgeBasePanel from "../components/KnowledgeBasePanel";
import {
  createProject,
  createWorkspace,
  deleteProject,
  getProjects,
  getUserWorkspaces,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  inviteWorkspaceMember as inviteWorkspaceMemberRequest,
  logout,
  removeWorkspaceMember,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceSummary,
  updateWorkspace,
  updateWorkspaceMemberRole,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";
import { useUserRole } from "../context/RoleContext";
import { normalizeWorkspaceRole } from "../utils/roles";

type PanelView = "projects" | "workspace-members" | "knowledge-base";

type Project = {
  id: string;
  title: string;
  description: string;
  goals: string;
  north_star_metric?: string | null;
  target_personas?: string[] | null;
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceRole, setWorkspaceRole, refreshWorkspaceRole } = useUserRole();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [renameLoading, setRenameLoading] = useState(false);
  const [activeView, setActiveView] = useState<PanelView>("projects");

  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) : null;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersSuccess, setMembersSuccess] = useState<string | null>(null);

  const canEditWorkspace = workspaceRole === "admin" || workspaceRole === "editor";
  const canAdminWorkspace = workspaceRole === "admin";
  const workspaceRoleLabel = workspaceRole.charAt(0).toUpperCase() + workspaceRole.slice(1);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.title.localeCompare(b.title)),
    [projects]
  );

  const applyWorkspaceContext = useCallback(
    (workspace: WorkspaceSummary, nextView?: PanelView) => {
      const role = normalizeWorkspaceRole(workspace.role);
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setWorkspaceRole(role);
      setActiveView(nextView ?? "projects");
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspace.id);
        window.sessionStorage.setItem(WORKSPACE_NAME_KEY, workspace.name);
      }
    },
    [setWorkspaceRole]
  );

  const refreshMembers = useCallback(async () => {
    if (!workspaceId || !userId) {
      setMembers([]);
      setInvitations([]);
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const list = await getWorkspaceMembers(workspaceId, userId);
      setMembers(list);
      if (canAdminWorkspace) {
        const pending = await getWorkspaceInvitations(workspaceId, userId);
        setInvitations(pending);
      } else {
        setInvitations([]);
      }
    } catch (err: any) {
      setMembersError(err.message || "Failed to load workspace members.");
    } finally {
      setMembersLoading(false);
    }
  }, [workspaceId, userId, canAdminWorkspace]);

  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    getProjects(workspaceId)
      .then((data) => setProjects(data.projects || []))
      .catch(() => setErrorMessage("❌ Failed to fetch projects"))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    if (activeView === "workspace-members") {
      setMembersSuccess(null);
      setMembersError(null);
      refreshMembers();
    }
  }, [activeView, refreshMembers]);

  useEffect(() => {
    if (membersSuccess || membersError) {
      const timer = setTimeout(() => {
        setMembersSuccess(null);
        setMembersError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [membersSuccess, membersError]);

  useEffect(() => {
    if (!canEditWorkspace) {
      setShowCreate(false);
    }
  }, [canEditWorkspace]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEditWorkspace) {
      setErrorMessage("You have read-only access to this workspace.");
      return;
    }
    const form = e.currentTarget;
    const formData = new FormData(form);
    const title = (formData.get("title") as string).trim();
    const description = (formData.get("description") as string).trim();
    const goals = (formData.get("goals") as string).trim();
    const northStarMetric = ((formData.get("north_star_metric") as string) || "").trim();
    const personasRaw = (formData.get("target_personas") as string) || "";
    const targetPersonas = personasRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!title || !description || !goals) {
      setErrorMessage("Please fill in title, description, and goals.");
      return;
    }

    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      const created = await createProject({
        title,
        description,
        goals,
        north_star_metric: northStarMetric || null,
        target_personas: targetPersonas,
        workspace_id: workspaceId,
      });
      setProjects((prev) => [...prev, { id: created.id, ...created.project }]);
      setSuccessMessage("✅ Project created successfully!");
      setShowCreate(false);
      form.reset();
    } catch (err) {
      console.error(err);
      setErrorMessage("❌ Failed to create project");
    }
  }

  async function handleDelete(id: string) {
    if (!canEditWorkspace) {
      setErrorMessage("You have read-only access to this workspace.");
      return;
    }
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      await deleteProject(id, workspaceId);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setSuccessMessage("🗑️ Project deleted successfully!");
    } catch (err) {
      console.error(err);
      setErrorMessage("❌ Failed to delete project");
    }
  }

  const handleWorkspaceNavigation = useCallback(
    (workspace: WorkspaceSummary, view: PanelView) => {
      if (workspace.id !== workspaceId) {
        applyWorkspaceContext(workspace, view);
        navigate(`/projects?workspace=${workspace.id}`, { replace: true });
      } else {
        setActiveView(view);
      }
    },
    [applyWorkspaceContext, navigate, workspaceId]
  );

  const inviteWorkspaceCollaborator = useCallback(
    async (email: string, role: WorkspaceRole) => {
      if (!workspaceId || !userId) throw new Error("Missing workspace context");
      setMembersError(null);
      setMembersSuccess(null);
      await inviteWorkspaceMemberRequest(
        workspaceId,
        { email: email.trim(), role },
        userId
      );
      setMembersSuccess("Invitation sent.");
      await refreshMembers();
    },
    [workspaceId, userId, refreshMembers]
  );

  const handleMemberRoleChange = useCallback(
    async (memberId: string, role: WorkspaceRole) => {
      if (!workspaceId) return;
      try {
        const updated = await updateWorkspaceMemberRole(workspaceId, memberId, role, userId ?? undefined);
        setMembers((prev) => prev.map((member) => (member.id === memberId ? updated : member)));
        setMembersSuccess("Member role updated.");
        if (updated.user_id === userId && workspaceId && userId) {
          await refreshWorkspaceRole(workspaceId, userId);
        }
      } catch (err: any) {
        setMembersError(err.message || "Failed to update member role.");
      }
    },
    [workspaceId, userId, refreshWorkspaceRole]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!workspaceId || !userId) return;
      try {
        await removeWorkspaceMember(workspaceId, memberId, userId);
        setMembers((prev) => prev.filter((member) => member.id !== memberId));
        setMembersSuccess("Member removed.");
      } catch (err: any) {
        setMembersError(err.message || "Failed to remove member.");
      }
    },
    [workspaceId, userId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasUser = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (!hasUser) {
      navigate("/signin", { replace: true });
      return;
    }

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("workspace");
    const storedWorkspace = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    const storedName = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);

    const effectiveWorkspace = fromQuery || storedWorkspace;
    if (effectiveWorkspace) {
      setWorkspaceId(effectiveWorkspace);
      if (fromQuery) {
        window.sessionStorage.setItem(WORKSPACE_ID_KEY, fromQuery);
      }
      if (storedName) {
        setWorkspaceName(storedName);
      }
    }
  }, [navigate, location.search, setWorkspaceRole]);

  useEffect(() => {
    const loadWorkspaces = async () => {
      if (!userId) return;
      setWorkspaceLoading(true);
      try {
        const list = await getUserWorkspaces(userId);
        setWorkspaces(list);
        if (!workspaceId && list.length > 0) {
          applyWorkspaceContext(list[0]);
          navigate(`/projects?workspace=${list[0].id}`, { replace: true });
          return;
        }
        if (workspaceId) {
          const current = list.find((ws) => ws.id === workspaceId);
          if (current) {
            setWorkspaceName(current.name);
            window.sessionStorage.setItem(WORKSPACE_NAME_KEY, current.name);
            const role = normalizeWorkspaceRole(current.role);
            setWorkspaceRole(role);
          }
        }
        if (list.length === 0) {
          setErrorMessage("No workspaces yet. Create one to get started.");
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(WORKSPACE_ID_KEY);
            window.sessionStorage.removeItem(WORKSPACE_NAME_KEY);
          }
          setWorkspaceRole("viewer");
        }
      } catch (err) {
        console.warn("Failed to load workspaces", err);
        setErrorMessage("Failed to load workspaces. Please try again.");
      } finally {
        setWorkspaceLoading(false);
      }
    };

    loadWorkspaces();
  }, [userId, workspaceId, navigate, applyWorkspaceContext, setWorkspaceRole]);

  useEffect(() => {
    const maybeLoadWorkspaceName = async () => {
      if (!workspaceName && workspaceId) {
        const user = window.sessionStorage.getItem(USER_ID_KEY);
        if (!user) return;
        try {
          const list = await getUserWorkspaces(user);
          const match = list.find((ws) => ws.id === workspaceId);
          if (match) {
            setWorkspaceName(match.name);
            window.sessionStorage.setItem(WORKSPACE_NAME_KEY, match.name);
            const role = normalizeWorkspaceRole(match.role);
            setWorkspaceRole(role);
          }
        } catch (err) {
          console.warn("Failed to load workspace name", err);
        }
      }
    };

    if (typeof window !== "undefined") {
      maybeLoadWorkspaceName();
    }
  }, [workspaceId, workspaceName, setWorkspaceRole]);

  const isProjectsView = activeView === "projects";
  const isKnowledgeBaseView = activeView === "knowledge-base";

  if (selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        workspaceId={workspaceId}
        workspaceRole={workspaceRole}
        onProjectUpdated={(updated) =>
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
        }
        onBack={() => setSelectedProjectId(null)}
        onOpenKnowledgeBase={() => {
          setSelectedProjectId(null);
          setActiveView("knowledge-base");
        }}
      />
    );
  }

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn("Sign out request failed", err);
    }

    if (typeof window !== "undefined") {
      [AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY].forEach((key) =>
        window.sessionStorage.removeItem(key)
      );
    }

    navigate("/signin", { replace: true });
  };

  const handleCreateWorkspace = async () => {
    if (!userId) {
      navigate("/signin", { replace: true });
      return;
    }
    const name = window.prompt("Workspace name", "New Workspace");
    if (!name?.trim()) return;

    try {
      const workspace = await createWorkspace({ name: name.trim(), owner_id: userId });
      const updatedList = await getUserWorkspaces(userId);
      setWorkspaces(updatedList);
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspace.id);
      window.sessionStorage.setItem(WORKSPACE_NAME_KEY, workspace.name);
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setWorkspaceRole("admin");
      setActiveView("projects");
        navigate(`/projects?workspace=${workspace.id}`, { replace: true });
    } catch (err) {
      console.error("Failed to create workspace", err);
      setErrorMessage("Failed to create workspace");
    }
  };

  if (!workspaceId) {
    if (workspaceLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-500">
          Loading workspace...
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Create your first workspace</h1>
          <p className="mt-2 text-sm text-slate-500">
            We couldn't find an active workspace for your account. Create one now to get started.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={handleCreateWorkspace}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create workspace
            </button>
            <button
              onClick={() => navigate("/signin", { replace: true })}
              className="rounded-full bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
            >
              Return to sign in
            </button>
          </div>
          {errorMessage && <p className="mt-4 text-sm text-rose-500">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 shadow-sm md:flex">
          <div className="flex items-center gap-3 pb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-600">
              PM
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Workspaces</p>
              <p className="text-xs text-slate-400">Switch or manage context</p>
            </div>
          </div>
          <nav className="flex-1 space-y-2 overflow-y-auto text-sm">
            {workspaces.map((ws) => {
              const isActiveWorkspace = ws.id === workspaceId;
              return (
                <div key={ws.id} className="space-y-2">
                  <button
                    onClick={() => handleWorkspaceNavigation(ws, "projects")}
                    className={`w-full rounded-2xl px-3 py-2 text-left transition ${
                      isActiveWorkspace
                        ? "bg-blue-100/80 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {ws.name}
                  </button>
                  <div className="ml-3 border-l border-slate-100 pl-3 text-xs">
                    <button
                      onClick={() => {
                        navigate(`/dashboard?workspace=${ws.id}`);
                      }}
                      className="mb-1 block w-full rounded-full px-3 py-1 text-left font-semibold text-slate-500 transition hover:bg-slate-100"
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={() => handleWorkspaceNavigation(ws, "projects")}
                      className={`mb-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                        isActiveWorkspace && activeView === "projects"
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      Projects
                    </button>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Settings</p>
                    <button
                      onClick={() => handleWorkspaceNavigation(ws, "workspace-members")}
                      className={`mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                        isActiveWorkspace && activeView === "workspace-members"
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      Members
                    </button>
                    <button
                      onClick={() => handleWorkspaceNavigation(ws, "knowledge-base")}
                      className={`mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                        isActiveWorkspace && activeView === "knowledge-base"
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      Knowledge Base
                    </button>
                  </div>
                </div>
              );
            })}
            {workspaces.length === 0 && !workspaceLoading && (
              <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                No workspaces yet.
              </p>
            )}
          </nav>
          {canAdminWorkspace && (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4 text-xs">
              <p className="font-semibold uppercase tracking-[0.3em] text-slate-400">Global</p>
              <Link
                to="/settings"
                className="mt-3 block rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
              >
                AI Provider Settings
              </Link>
              <p className="mt-2 text-[11px] text-slate-400">
                Configure the assistant&apos;s OpenAI key for every workspace.
              </p>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCreateWorkspace}
              className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              + New workspace
            </button>
            <button
              disabled={renameLoading || !workspaceId}
              onClick={async () => {
                if (!workspaceId) return;
                const current =
                  workspaces.find((ws) => ws.id === workspaceId)?.name || workspaceName || "Workspace";
                const nextName = window.prompt("Rename workspace", current)?.trim();
                if (!nextName || nextName === current) return;
                try {
                  setRenameLoading(true);
                  const updated = await updateWorkspace(workspaceId, nextName);
                  window.sessionStorage.setItem(WORKSPACE_NAME_KEY, updated.name);
                  setWorkspaceName(updated.name);
                  setWorkspaces((prev) =>
                    prev.map((ws) => (ws.id === workspaceId ? { ...ws, name: updated.name } : ws))
                  );
                } catch (err) {
                  console.error("Failed to rename workspace", err);
                  setErrorMessage("Failed to rename workspace");
                } finally {
                  setRenameLoading(false);
                }
              }}
              className="w-full rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300 disabled:opacity-60"
            >
              {renameLoading ? "Renaming..." : "Rename workspace"}
            </button>
            <button
              onClick={handleSignOut}
              className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 md:px-10 md:py-10">
          <div className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workspace</p>
            <h1 className="text-2xl font-semibold text-slate-900">{workspaceName || "Workspace"}</h1>
            <p className="text-sm text-slate-500">
              {isProjectsView
                ? "Projects and artifacts scoped to this workspace."
                : isKnowledgeBaseView
                ? "Workspace knowledge base for documents, insights, and AI context."
                : "Workspace settings → Members. Manage roles and invitations."}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Role: {workspaceRoleLabel}
            </span>
            <button
              type="button"
              onClick={() => navigate("/builder")}
              className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Prototype Builder
            </button>
          </div>
          <div className="mt-3 md:hidden">
            {workspaces.length > 0 && workspaceId && (
              <select
                value={workspaceId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const entry = workspaces.find((ws) => ws.id === nextId);
                  if (entry) {
                    handleWorkspaceNavigation(entry, "projects");
                  } else {
                    setWorkspaceId(nextId);
                    setActiveView("projects");
                    navigate(`/projects?workspace=${nextId}`, { replace: true });
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {isProjectsView && (successMessage || errorMessage) && (
            <div className="mt-6 space-y-2">
              {successMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow-sm">
                  {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-sm">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          {isProjectsView ? (
            <section className="mt-8">
              <div className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-3xl font-bold">Projects</h2>
                  <p className="mt-2 text-base text-slate-500">
                    Manage all your product initiatives here.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <button
                    onClick={() => {
                      if (canEditWorkspace) {
                        setShowCreate(true);
                      }
                    }}
                    disabled={!canEditWorkspace}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition ${
                      canEditWorkspace
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "cursor-not-allowed bg-slate-200 text-slate-500"
                    }`}
                  >
                    <span className="text-lg leading-none">＋</span>
                    New Project
                  </button>
                  {!canEditWorkspace && (
                    <p className="text-xs text-slate-500">Viewers cannot create projects.</p>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-12 text-center text-slate-500">
                  Loading projects...
                </div>
              ) : sortedProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center text-slate-500">
                  No projects yet. {canEditWorkspace ? "Click “New Project” to get started." : "Ask an admin to add one."}
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {sortedProjects.map((project) => (
                    <article
                      key={project.id}
                      className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] transition hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.4)]"
                    >
                      <header className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Initiative</p>
                          <h3 className="text-xl font-semibold text-slate-900">{project.title}</h3>
                        </div>
                        {project.north_star_metric && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                            {project.north_star_metric}
                          </span>
                        )}
                      </header>
                      <p className="mt-3 text-sm leading-6 text-slate-500 line-clamp-3">
                        {project.description}
                      </p>
                      <div className="mt-4 grid gap-4 text-xs text-slate-500 sm:grid-cols-2">
                        <div>
                          <p className="font-semibold uppercase tracking-wide text-slate-400">Goals</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {project.goals || "Not specified"}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold uppercase tracking-wide text-slate-400">Personas</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {project.target_personas && project.target_personas.length > 0 ? (
                              project.target_personas.map((persona) => (
                                <span
                                  key={`${project.id}-${persona}`}
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                >
                                  {persona}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-slate-400">Not defined</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        Keep this project aligned by linking PRDs, roadmaps, and task boards in one place.
                      </div>
                      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                        <button
                          onClick={() => setSelectedProjectId(project.id)}
                          className="font-semibold text-blue-600 transition hover:text-blue-700"
                        >
                          Open
                        </button>
                        {canEditWorkspace ? (
                          <button
                            onClick={() => handleDelete(project.id)}
                            className="text-slate-400 transition hover:text-rose-500"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Read-only</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : activeView === "workspace-members" ? (
            <WorkspaceMembersPanel
              workspaceName={workspaceName}
              workspaceRole={workspaceRole}
              currentUserId={userId}
              members={members}
              invitations={invitations}
              loading={membersLoading}
              successMessage={membersSuccess}
              errorMessage={membersError}
              canAdminWorkspace={canAdminWorkspace}
              onInvite={inviteWorkspaceCollaborator}
              onRoleChange={handleMemberRoleChange}
              onRemoveMember={handleRemoveMember}
            />
          ) : (
            <KnowledgeBasePanel
              workspaceId={workspaceId}
              workspaceRole={workspaceRole}
              userId={userId}
              projectOptions={sortedProjects.map((project) => ({ id: project.id, label: project.title }))}
            />
          )}
        </main>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Create a New Project</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-slate-400 transition hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={handleCreate}>
              <label className="block text-sm font-medium text-slate-600">
                Title
                <input
                  name="title"
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter project title"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Description
                <textarea
                  name="description"
                  className="mt-2 h-28 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Provide a short project description"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Goals
                <textarea
                  name="goals"
                  className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="What are you hoping to achieve?"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                North Star Metric
                <input
                  name="north_star_metric"
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Optional"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Target Personas
                <input
                  name="target_personas"
                  type="text"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Comma-separated (e.g. Product Managers, Designers)"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
