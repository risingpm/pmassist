import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ProjectDetail from "../components/ProjectDetail";
import {
  createProject,
  createWorkspace,
  deleteProject,
  getProjects,
  getUserWorkspaces,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  inviteWorkspaceMember,
  logout,
  removeWorkspaceMember,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
  type WorkspaceSummary,
  updateWorkspace,
  updateWorkspaceMemberRole,
} from "../api";
import {
  AUTH_USER_KEY,
  USER_ID_KEY,
  WORKSPACE_ID_KEY,
  WORKSPACE_NAME_KEY,
  WORKSPACE_ROLE_KEY,
} from "../constants";

type PanelView = "projects" | "workspace-members";
const WORKSPACE_ROLE_OPTIONS: WorkspaceRole[] = ["admin", "editor", "viewer"];

const normalizeWorkspaceRole = (value?: string | null): WorkspaceRole =>
  value === "admin" || value === "editor" ? value : "viewer";

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
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>(() => {
    if (typeof window === "undefined") return "viewer";
    return normalizeWorkspaceRole(window.sessionStorage.getItem(WORKSPACE_ROLE_KEY));
  });
  const [activeView, setActiveView] = useState<PanelView>("projects");

  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) : null;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersSuccess, setMembersSuccess] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [inviting, setInviting] = useState(false);

  const canEditWorkspace = workspaceRole === "admin" || workspaceRole === "editor";
  const canAdminWorkspace = workspaceRole === "admin";
  const workspaceRoleLabel = workspaceRole.charAt(0).toUpperCase() + workspaceRole.slice(1);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.title.localeCompare(b.title)),
    [projects]
  );
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const nameA = a.display_name || a.email;
        const nameB = b.display_name || b.email;
        return nameA.localeCompare(nameB);
      }),
    [members]
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
        window.sessionStorage.setItem(WORKSPACE_ROLE_KEY, role);
      }
    },
    []
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
        navigate(`/dashboard?workspace=${workspace.id}`, { replace: true });
      } else {
        setActiveView(view);
      }
    },
    [applyWorkspaceContext, navigate, workspaceId]
  );

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return value;
    }
  };

  const handleInviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !userId) return;
    setInviting(true);
    setMembersError(null);
    try {
      await inviteWorkspaceMember(
        workspaceId,
        { email: inviteEmail.trim(), role: inviteRole },
        userId
      );
      setInviteEmail("");
      setInviteRole("viewer");
      setMembersSuccess("Invitation sent.");
      refreshMembers();
    } catch (err: any) {
      setMembersError(err.message || "Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  };

  const handleMemberRoleChange = async (memberId: string, role: WorkspaceRole) => {
    if (!workspaceId) return;
    try {
      const updated = await updateWorkspaceMemberRole(workspaceId, memberId, role, userId ?? undefined);
      setMembers((prev) => prev.map((member) => (member.id === memberId ? updated : member)));
      setMembersSuccess("Member role updated.");
    } catch (err: any) {
      setMembersError(err.message || "Failed to update member role.");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspaceId || !userId) return;
    try {
      await removeWorkspaceMember(workspaceId, memberId, userId);
      setMembers((prev) => prev.filter((member) => member.id !== memberId));
      setMembersSuccess("Member removed.");
    } catch (err: any) {
      setMembersError(err.message || "Failed to remove member.");
    }
  };

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
    const storedRole = window.sessionStorage.getItem(WORKSPACE_ROLE_KEY);

    const effectiveWorkspace = fromQuery || storedWorkspace;
    if (effectiveWorkspace) {
      setWorkspaceId(effectiveWorkspace);
      if (fromQuery) {
        window.sessionStorage.setItem(WORKSPACE_ID_KEY, fromQuery);
      }
      if (storedName) {
        setWorkspaceName(storedName);
      }
      if (storedRole) {
        setWorkspaceRole(normalizeWorkspaceRole(storedRole));
      }
    }
  }, [navigate, location.search]);

  useEffect(() => {
    const loadWorkspaces = async () => {
      if (!userId) return;
      setWorkspaceLoading(true);
      try {
        const list = await getUserWorkspaces(userId);
        setWorkspaces(list);
        if (!workspaceId && list.length > 0) {
          applyWorkspaceContext(list[0]);
          navigate(`/dashboard?workspace=${list[0].id}`, { replace: true });
          return;
        }
        if (workspaceId) {
          const current = list.find((ws) => ws.id === workspaceId);
          if (current) {
            setWorkspaceName(current.name);
            window.sessionStorage.setItem(WORKSPACE_NAME_KEY, current.name);
            const role = normalizeWorkspaceRole(current.role);
            setWorkspaceRole(role);
            window.sessionStorage.setItem(WORKSPACE_ROLE_KEY, role);
          }
        }
        if (list.length === 0) {
          setErrorMessage("No workspaces yet. Create one to get started.");
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(WORKSPACE_ID_KEY);
            window.sessionStorage.removeItem(WORKSPACE_NAME_KEY);
            window.sessionStorage.removeItem(WORKSPACE_ROLE_KEY);
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
  }, [userId, workspaceId, navigate, applyWorkspaceContext]);

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
            window.sessionStorage.setItem(WORKSPACE_ROLE_KEY, role);
          }
        } catch (err) {
          console.warn("Failed to load workspace name", err);
        }
      }
    };

    if (typeof window !== "undefined") {
      maybeLoadWorkspaceName();
    }
  }, [workspaceId, workspaceName]);

  const isProjectsView = activeView === "projects";

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
      [AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WORKSPACE_ROLE_KEY].forEach(
        (key) => window.sessionStorage.removeItem(key)
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
      window.sessionStorage.setItem(WORKSPACE_ROLE_KEY, "admin");
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setWorkspaceRole("admin");
      setActiveView("projects");
      navigate(`/dashboard?workspace=${workspace.id}`, { replace: true });
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
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
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{workspaceName || "Workspace"}</h1>
              <p className="text-sm text-slate-500">
                {isProjectsView
                  ? "Projects and artifacts scoped to this workspace."
                  : "Workspace settings → Members. Manage roles and invitations."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Role: {workspaceRoleLabel}
              </span>
              <div className="md:hidden">
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
                        navigate(`/dashboard?workspace=${nextId}`, { replace: true });
                      }
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </header>

          {(successMessage || errorMessage) && (
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
                      className="flex h-full flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] transition hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.4)]"
                    >
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">{project.title}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-500">{project.description}</p>
                        <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400">
                          {project.goals}
                        </div>
                        {project.north_star_metric && (
                          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-500">
                            North Star: {project.north_star_metric}
                          </div>
                        )}
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
          ) : (
            <section className="mt-8 space-y-6">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 pb-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Workspace Members</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Invite collaborators and manage their access inside this workspace.
                    </p>
                    {!canAdminWorkspace && (
                      <p className="mt-1 text-xs text-slate-500">
                        Only admins can change roles or invite new members.
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {workspaceRoleLabel} access
                  </span>
                </div>

                {(membersSuccess || membersError) && (
                  <div className="mb-6 space-y-2">
                    {membersSuccess && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow-sm">
                        {membersSuccess}
                      </div>
                    )}
                    {membersError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-sm">
                        {membersError}
                      </div>
                    )}
                  </div>
                )}

                {membersLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Loading members...
                  </div>
                ) : sortedMembers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    No members found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <th className="pb-3 pr-3">Member</th>
                          <th className="pb-3 pr-3">Role</th>
                          <th className="pb-3 pr-3">Joined</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMembers.map((member) => {
                          const canModify = canAdminWorkspace && member.user_id !== userId;
                          return (
                            <tr key={member.id} className="border-t border-slate-100 text-slate-600">
                              <td className="py-3 pr-3">
                                <div className="font-medium text-slate-900">
                                  {member.display_name || member.email}
                                </div>
                                <div className="text-xs text-slate-500">{member.email}</div>
                              </td>
                              <td className="py-3 pr-3">
                                {canAdminWorkspace ? (
                                  <select
                                    value={member.role}
                                    onChange={(event) =>
                                      handleMemberRoleChange(
                                        member.id,
                                        event.target.value as WorkspaceRole
                                      )
                                    }
                                    disabled={!canModify}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-600 disabled:opacity-50"
                                  >
                                    {WORKSPACE_ROLE_OPTIONS.map((roleOption) => (
                                      <option key={roleOption} value={roleOption}>
                                        {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs font-semibold capitalize text-slate-500">
                                    {member.role}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pr-3 text-xs text-slate-500">
                                {formatDate(member.joined_at)}
                              </td>
                              <td className="py-3 text-right text-xs">
                                {canModify ? (
                                  <button
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-500 transition hover:bg-rose-100"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <span className="text-slate-400">
                                    {member.user_id === userId ? "You" : "View only"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {canAdminWorkspace && (
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">Invite members</h3>
                      <p className="text-sm text-slate-500">
                        Send an email invitation and assign a role in one step.
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      Default role: Viewer unless specified
                    </span>
                  </div>
                  <form
                    className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr_auto]"
                    onSubmit={handleInviteMember}
                  >
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="teammate@email.com"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold capitalize text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      {WORKSPACE_ROLE_OPTIONS.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inviting ? "Sending..." : "Send invite"}
                    </button>
                  </form>
                  {invitations.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Pending invitations
                      </h4>
                      <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
                        {invitations.map((invite) => (
                          <li
                            key={invite.id}
                            className="flex flex-col gap-1 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{invite.email}</p>
                              <p className="text-xs text-slate-500">
                                Role: {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} •{" "}
                                Invited {formatDate(invite.created_at)}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
                              Pending acceptance
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
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
