import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useMatch } from "react-router-dom";

import ProjectDetail from "../components/ProjectDetail";
import WorkspaceMembersPanel from "../components/WorkspaceMembersPanel";
import {
  createProject,
  createWorkspace,
  deleteProject,
  deleteWorkspace,
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
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../constants";
import { useUserRole } from "../context/RoleContext";
import { normalizeWorkspaceRole as normalizeWorkspaceRoleValue } from "../utils/roles";
import { SURFACE_CARD, SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, ICON_BUTTON, PILL_META } from "../styles/theme";

type PanelView = "projects" | "workspace-members" | "knowledge-base" | "templates";
type ProjectTabRoute = "knowledge" | "roadmap" | "prototypes" | "tasks" | "prd" | "members" | "strategy";

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
  const params = useParams<{ workspaceId?: string; projectId?: string; tab?: string }>();
  const { workspaceRole, setWorkspaceRole, refreshWorkspaceRole } = useUserRole();
  const membersMatch = useMatch("/workspaces/:workspaceId/projects/members");
  const detailMatch = useMatch("/workspaces/:workspaceId/projects/detail/:projectId/:tab?");

  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalName, setWorkspaceModalName] = useState("");
  const [workspaceModalError, setWorkspaceModalError] = useState<string | null>(null);
  const [workspaceModalLoading, setWorkspaceModalLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (params.workspaceId) return params.workspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!params.workspaceId) return;
    setWorkspaceId(params.workspaceId);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, params.workspaceId);
    }
  }, [params.workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasUser = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (!hasUser) {
      navigate("/signin", { replace: true });
    }
  }, [navigate]);

  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) : null;
  const selectedProjectId = detailMatch?.params?.projectId ?? null;
  const tabParam = detailMatch?.params?.tab as ProjectTabRoute | undefined;
  const validTabs: ProjectTabRoute[] = ["knowledge", "roadmap", "prototypes", "tasks", "prd", "members", "strategy"];
  const projectDetailTab = tabParam && validTabs.includes(tabParam) ? tabParam : undefined;
  const activeView: PanelView = membersMatch ? "workspace-members" : "projects";
  const isProjectsView = activeView === "projects" && !selectedProjectId;

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
    (workspace: WorkspaceSummary) => {
      const role = normalizeWorkspaceRoleValue(workspace.role);
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setWorkspaceRole(role);
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
    if (membersMatch) {
      setMembersSuccess(null);
      setMembersError(null);
      refreshMembers();
    }
  }, [membersMatch, refreshMembers]);

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

  const resolveWorkspacePath = useCallback((id: string, view: PanelView) => {
    switch (view) {
      case "knowledge-base":
        return `/workspaces/${id}/knowledge`;
      case "workspace-members":
        return `/workspaces/${id}/projects/members`;
      case "templates":
        return `/workspaces/${id}/templates`;
      default:
        return `/workspaces/${id}/projects`;
    }
  }, []);

  const handleWorkspaceNavigation = useCallback(
    (workspace: WorkspaceSummary, view: PanelView) => {
      applyWorkspaceContext(workspace);
      navigate(resolveWorkspacePath(workspace.id, view));
    },
    [applyWorkspaceContext, navigate, resolveWorkspacePath]
  );

  const openKnowledgeBaseView = useCallback(() => {
    if (!workspaceId) return;
    navigate(`/workspaces/${workspaceId}/knowledge`);
  }, [workspaceId, navigate]);

  const normalizePath = useCallback((path: string) => {
    if (!path) return "/";
    const trimmed = path.replace(/\/+$/, "");
    return trimmed || "/";
  }, []);
  const lastNavigatePathRef = useRef<string | null>(null);

  useEffect(() => {
    lastNavigatePathRef.current = normalizePath(location.pathname);
  }, [location.pathname, normalizePath]);

  const handleProjectBack = useCallback(() => {
    if (!workspaceId) return;
    navigate(`/workspaces/${workspaceId}/projects`);
  }, [workspaceId, navigate]);

  const handleProjectTabChange = useCallback(
    (tab: ProjectTabRoute) => {
      if (!workspaceId || !selectedProjectId) return;
      const base = `/workspaces/${workspaceId}/projects/detail/${selectedProjectId}`;
      const suffix = tab && tab !== "knowledge" ? `/${tab}` : "";
      const target = `${base}${suffix}`;
      const normalizedTarget = normalizePath(target);
      const normalizedCurrent = normalizePath(location.pathname);
      if (normalizedCurrent === normalizedTarget || lastNavigatePathRef.current === normalizedTarget) {
        return;
      }
      lastNavigatePathRef.current = normalizedTarget;
      navigate(target, { replace: true });
    },
    [workspaceId, selectedProjectId, navigate, location.pathname, normalizePath]
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

  const handleDeleteWorkspace = useCallback(
    async (targetWorkspaceId?: string, roleHint?: WorkspaceRole) => {
      const resolvedId = targetWorkspaceId ?? workspaceId;
      if (!resolvedId || !userId) {
        setErrorMessage("Missing workspace context.");
        return;
      }
      const targetId = resolvedId as string;
      const isAdminForTarget = roleHint
        ? normalizeWorkspaceRoleValue(roleHint) === "admin"
        : canAdminWorkspace;
      if (!isAdminForTarget) {
        setErrorMessage("Only admins can delete a workspace.");
        return;
      }
      const confirmMessage =
        "Deleting this workspace will remove all projects, tasks, and documents. This cannot be undone. Continue?";
      if (!window.confirm(confirmMessage)) return;
      setDeleteLoading(true);
      try {
        await deleteWorkspace(targetId, userId);
        const updatedList = workspaces.filter((ws) => ws.id !== targetId);
        setWorkspaces(updatedList);
        setSuccessMessage("Workspace deleted.");
        if (targetId === workspaceId) {
          if (updatedList.length > 0) {
            const next = updatedList[0];
            applyWorkspaceContext(next);
            navigate(`/workspaces/${next.id}/projects`, { replace: true });
          } else {
            if (typeof window !== "undefined") {
              [WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY].forEach((key) => window.sessionStorage.removeItem(key));
            }
            setWorkspaceId(null);
            setWorkspaceName(null);
            navigate("/onboarding", { replace: true });
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to delete workspace.");
      } finally {
        setDeleteLoading(false);
      }
    },
    [workspaceId, userId, canAdminWorkspace, workspaces, applyWorkspaceContext, navigate]
  );

  const handleRenameWorkspace = useCallback(
    async (targetWorkspaceId?: string, roleHint?: WorkspaceRole) => {
      const isAdminForTarget = roleHint
        ? normalizeWorkspaceRoleValue(roleHint) === "admin"
        : canAdminWorkspace;
      if (!isAdminForTarget) {
        setErrorMessage("Only admins can rename workspaces.");
        return;
      }
      const resolvedId = targetWorkspaceId ?? workspaceId;
      if (!resolvedId) {
        setErrorMessage("Missing workspace context.");
        return;
      }
      const targetId = resolvedId as string;
      const current =
        workspaces.find((ws) => ws.id === targetId)?.name ??
        (targetId === workspaceId ? workspaceName ?? "Workspace" : "Workspace");
      const nextName = window.prompt("Rename workspace", current)?.trim();
      if (!nextName || nextName === current) return;
      setRenameLoading(true);
      try {
        const updated = await updateWorkspace(targetId, nextName);
        if (targetId === workspaceId) {
          window.sessionStorage.setItem(WORKSPACE_NAME_KEY, updated.name);
          setWorkspaceName(updated.name);
        }
        setWorkspaces((prev) =>
          prev.map((ws) => (ws.id === targetId ? { ...ws, name: updated.name } : ws))
        );
        setSuccessMessage("Workspace renamed.");
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to rename workspace.");
      } finally {
        setRenameLoading(false);
      }
    },
    [canAdminWorkspace, workspaceId, workspaceName, workspaces]
  );

  useEffect(() => {
    if (!userId) return;
    let canceled = false;
    const controller = new AbortController();

    const loadWorkspaces = async () => {
      setWorkspaceLoading(true);
      try {
        const list = await getUserWorkspaces(userId, controller.signal);
        if (canceled) return;
        setWorkspaces(list);
        if (!workspaceId && list.length > 0) {
          applyWorkspaceContext(list[0]);
          navigate(`/workspaces/${list[0].id}/projects`, { replace: true });
          return;
        }
        if (workspaceId) {
          const current = list.find((ws) => ws.id === workspaceId);
          if (current) {
            setWorkspaceName(current.name);
            window.sessionStorage.setItem(WORKSPACE_NAME_KEY, current.name);
            const role = normalizeWorkspaceRoleValue(current.role);
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
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.warn("Failed to load workspaces", err);
        setErrorMessage("Failed to load workspaces. Please try again.");
      } finally {
        if (!canceled) {
          setWorkspaceLoading(false);
        }
      }
    };

    loadWorkspaces();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [userId, workspaceId, navigate, applyWorkspaceContext, setWorkspaceRole]);

  useEffect(() => {
    if (workspaceName || !workspaceId || typeof window === "undefined") return;
    let canceled = false;
    const controller = new AbortController();

    const maybeLoadWorkspaceName = async () => {
      const user = window.sessionStorage.getItem(USER_ID_KEY);
      if (!user) return;
      try {
        const list = await getUserWorkspaces(user, controller.signal);
        if (canceled) return;
        const match = list.find((ws) => ws.id === workspaceId);
        if (match) {
          setWorkspaceName(match.name);
          window.sessionStorage.setItem(WORKSPACE_NAME_KEY, match.name);
          const role = normalizeWorkspaceRoleValue(match.role);
          setWorkspaceRole(role);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.warn("Failed to load workspace name", err);
      }
    };

    maybeLoadWorkspaceName();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [workspaceId, workspaceName, setWorkspaceRole]);

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

  const openWorkspaceModal = useCallback(() => {
    setWorkspaceModalName("");
    setWorkspaceModalError(null);
    setWorkspaceModalOpen(true);
  }, []);

  const handleCreateWorkspace = async (name?: string) => {
    if (!userId) {
      navigate("/signin", { replace: true });
      return;
    }
    const trimmed = (name ?? workspaceModalName).trim();
    if (!trimmed) {
      setWorkspaceModalError("Enter a workspace name.");
      return;
    }
    setWorkspaceModalLoading(true);
    setWorkspaceModalError(null);
    try {
      const workspace = await createWorkspace({ name: trimmed, owner_id: userId });
      const updatedList = await getUserWorkspaces(userId);
      setWorkspaces(updatedList);
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspace.id);
      window.sessionStorage.setItem(WORKSPACE_NAME_KEY, workspace.name);
      setWorkspaceId(workspace.id);
      setWorkspaceName(workspace.name);
      setWorkspaceRole("admin");
      setWorkspaceModalOpen(false);
      setWorkspaceModalName("");
      navigate(`/workspaces/${workspace.id}/projects`, { replace: true });
    } catch (err) {
      console.error("Failed to create workspace", err);
      setWorkspaceModalError("Failed to create workspace");
    } finally {
      setWorkspaceModalLoading(false);
    }
  };

  if (selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        workspaceId={workspaceId}
        workspaceRole={workspaceRole}
        initialTab={projectDetailTab}
        onTabChange={handleProjectTabChange}
        onProjectUpdated={(updated) =>
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
        }
        onBack={handleProjectBack}
        onOpenKnowledgeBase={openKnowledgeBaseView}
      />
    );
  }

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
        <div className={`${WIDE_PAGE_CONTAINER} py-20 text-center`}>
          <h1 className="text-2xl font-semibold">Create your first workspace</h1>
          <p className="mt-2 text-sm text-slate-500">
            We couldn't find an active workspace for your account. Create one now to get started.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={openWorkspaceModal} className={PRIMARY_BUTTON}>
              Create workspace
            </button>
            <button onClick={() => navigate("/signin", { replace: true })} className={SECONDARY_BUTTON}>
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
        <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 shadow-sm md:flex">
          <div className="pb-4">
            <p className={SECTION_LABEL}>Workspaces</p>
            <p className="text-sm text-slate-500">Switch context or manage settings.</p>
          </div>
          <nav className="flex-1 space-y-3 overflow-y-auto text-sm">
            {workspaces.map((ws) => {
              const isActiveWorkspace = ws.id === workspaceId;
              const workspaceRoleForEntry = normalizeWorkspaceRoleValue(ws.role);
              const canAdminThisWorkspace = workspaceRoleForEntry === "admin";
              return (
                <details
                  key={ws.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2"
                  open={isActiveWorkspace}
                >
                  <summary
                    className={`flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold ${
                      isActiveWorkspace ? "text-blue-700" : "text-slate-600"
                    }`}
                    onClick={(event) => {
                      event.preventDefault();
                      handleWorkspaceNavigation(ws, "projects");
                    }}
                  >
                    <span className="truncate">{ws.name}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {workspaceRoleForEntry}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2 border-l border-slate-200 pl-3 text-xs">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">Work</p>
                      <button
                        onClick={() => navigate(`/workspaces/${ws.id}/dashboard`)}
                        className="mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold text-slate-500 transition hover:bg-slate-100"
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => handleWorkspaceNavigation(ws, "projects")}
                        className={`mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                          isActiveWorkspace && activeView === "projects"
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Projects
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
                      <button
                        onClick={() => handleWorkspaceNavigation(ws, "templates")}
                        className={`mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                          isActiveWorkspace && activeView === "templates"
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        Template Library
                      </button>
                    </div>
                    <details className="mt-3 rounded-xl border border-slate-200 bg-white/90">
                      <summary className="cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                        Workspace settings
                      </summary>
                      <div className="border-t border-slate-200 px-3 py-2 text-xs">
                        <button
                          onClick={(event) => {
                            event.preventDefault();
                            handleWorkspaceNavigation(ws, "workspace-members");
                          }}
                          className={`mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold transition ${
                            isActiveWorkspace && activeView === "workspace-members"
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          Members
                        </button>
                        <div className="mt-3 space-y-2">
                          <button
                            disabled={!canAdminThisWorkspace || renameLoading}
                            onClick={(event) => {
                              event.preventDefault();
                              handleRenameWorkspace(ws.id, workspaceRoleForEntry);
                            }}
                            className={`block w-full rounded-full px-3 py-1 text-left font-semibold ${
                              canAdminThisWorkspace ? "text-slate-600 hover:bg-slate-100" : "text-slate-300"
                            } transition disabled:opacity-60`}
                          >
                            Rename workspace
                          </button>
                          <button
                            disabled={!canAdminThisWorkspace || deleteLoading}
                            onClick={(event) => {
                              event.preventDefault();
                              handleDeleteWorkspace(ws.id, workspaceRoleForEntry);
                            }}
                            className={`block w-full rounded-full px-3 py-1 text-left font-semibold ${
                              canAdminThisWorkspace ? "text-rose-600 hover:bg-rose-50" : "text-slate-300"
                            } transition disabled:opacity-60`}
                          >
                            Delete workspace
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                </details>
              );
            })}
            {workspaces.length === 0 && !workspaceLoading && (
              <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                No workspaces yet.
              </p>
            )}
          </nav>
          {canAdminWorkspace && (
            <details className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs">
              <summary className="cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">
                Global settings
              </summary>
              <div className="border-t border-slate-200 px-2 py-3 space-y-2">
                <Link
                  to="/settings"
                  className="block rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
                >
                  AI Providers
                </Link>
                <p className="text-[11px] text-slate-400">
                  Configure organization-wide AI credentials, guardrails, and billing.
                </p>
              </div>
            </details>
          )}
          <button
            onClick={handleSignOut}
            className="mt-4 w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </aside>

        <main className="flex-1 bg-slate-50">
          <div className={`${WIDE_PAGE_CONTAINER} py-6 md:py-10`}>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={SECTION_LABEL}>Workspace</p>
                <h1 className="text-3xl font-semibold text-slate-900">{workspaceName || "Workspace"}</h1>
                <p className="text-sm text-slate-500">
                  {isProjectsView
                    ? "Projects and artifacts scoped to this workspace."
                    : "Workspace settings → Members. Manage roles and invitations."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={PILL_META}>Role: {workspaceRoleLabel}</span>
                {workspaceId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/workspaces/${workspaceId}/builder`)}
                    className={SECONDARY_BUTTON}
                  >
                    Prototype Builder
                  </button>
                )}
                <button
                  type="button"
                  onClick={openWorkspaceModal}
                  className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                >
                  <span className="text-lg leading-none">＋</span>
                  Workspace
                </button>
              </div>
            </header>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              <button
                onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/projects`)}
                className={`rounded-full px-4 py-2 ${
                  isProjectsView ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                Projects
              </button>
              <button
                onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/knowledge`)}
                className="rounded-full px-4 py-2 bg-white text-slate-600 transition hover:bg-slate-100"
              >
                Knowledge
              </button>
              <button
                onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/projects/members`)}
                className={`rounded-full px-4 py-2 ${
                  activeView === "workspace-members"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                Members
              </button>
              <button
                onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/templates`)}
                className="rounded-full px-4 py-2 bg-white text-slate-600 transition hover:bg-slate-100"
              >
                Templates
              </button>
            </div>

            <div className="mt-4 md:hidden">
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
                      navigate(`/workspaces/${nextId}/projects`, { replace: true });
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
                          onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/projects/detail/${project.id}`)}
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
          )}
        </div>
        </main>
      </div>

      {workspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Create workspace</h2>
              <button
                onClick={() => setWorkspaceModalOpen(false)}
                className="text-slate-400 transition hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateWorkspace(workspaceModalName);
              }}
            >
              <label className="block text-sm font-medium text-slate-600">
                Workspace name
                <input
                  value={workspaceModalName}
                  onChange={(event) => setWorkspaceModalName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. Core Product"
                  autoFocus
                />
              </label>
              {workspaceModalError && (
                <p className="text-sm text-rose-500">{workspaceModalError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceModalOpen(false)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={workspaceModalLoading}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {workspaceModalLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
