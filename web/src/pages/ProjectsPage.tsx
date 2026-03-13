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
  resendWorkspaceInvitation,
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
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, PILL_META } from "../styles/theme";

const svgToDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const projectsHeaderIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><rect x='3' y='4' width='14' height='12' rx='2' stroke='%237c3aed' stroke-width='1.7'/><path d='M3 8h14' stroke='%237c3aed' stroke-width='1.7'/></svg>"
);
const projectsPlusIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M10 4v12M4 10h12' stroke='white' stroke-width='1.8' stroke-linecap='round'/></svg>"
);
const projectsSearchIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><circle cx='9' cy='9' r='5.25' stroke='%236b7280' stroke-width='1.6'/><path d='M13 13l3.5 3.5' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round'/></svg>"
);
const projectsEmptyIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none'><rect x='4' y='6' width='24' height='20' rx='4' stroke='%237c3aed' stroke-width='2'/><path d='M10 12h12M10 17h9' stroke='%237c3aed' stroke-width='2' stroke-linecap='round'/></svg>"
);
const projectsPrdIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><rect x='4' y='2.5' width='12' height='15' rx='2' stroke='%236b7280' stroke-width='1.6'/><path d='M7 7h6M7 10h6M7 13h4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/></svg>"
);
const projectsTaskIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><rect x='3.5' y='3.5' width='13' height='13' rx='2.5' stroke='%236b7280' stroke-width='1.6'/><path d='M7 10l2 2 4-4' stroke='%236b7280' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsClockIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='6.5' stroke='%236b7280' stroke-width='1.6'/><path d='M10 6.8v3.5l2.3 1.4' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsDeleteIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M5.5 6h9M8 6V4.7h4V6M7 8.2v6M10 8.2v6M13 8.2v6M6.3 6l.6 10h6.2l.6-10' stroke='%23ef4444' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsPagePrevIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M12 5.5L7.5 10 12 14.5' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsPageNextIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M8 5.5L12.5 10 8 14.5' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsPageDoublePrevIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M13 5.5L8.5 10 13 14.5M9.5 5.5L5 10l4.5 4.5' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const projectsPageDoubleNextIcon = svgToDataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'><path d='M7 5.5L11.5 10 7 14.5M10.5 5.5L15 10l-4.5 4.5' stroke='%236b7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>"
);
const PROJECT_ROW_COLORS = ["#ad46ff", "#2b7fff", "#00c950", "#ff6900", "#615fff"];

function BackChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12.5 4.5L7 10l5.5 5.5"
        stroke="#101828"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PanelView = "projects" | "workspace-members" | "templates";
type ProjectTabRoute =
  | "knowledge"
  | "roadmap"
  | "prototypes"
  | "tasks"
  | "prd"
  | "agents"
  | "members"
  | "strategy"
  | "assistant";

type Project = {
  id: string;
  title: string;
  description: string;
  goals: string;
  north_star_metric?: string | null;
  target_personas?: string[] | null;
  color?: string | null;
  prd_count?: number | null;
  task_count?: number | null;
  last_updated?: string | null;
  created_at?: string | null;
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
  const [projectSearch, setProjectSearch] = useState("");

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
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const detailPathMatch = useMemo(
    () => location.pathname.match(/\/projects\/detail\/([^/]+)(?:\/([^/]+))?/),
    [location.pathname]
  );
  const selectedProjectId =
    detailMatch?.params?.projectId ?? params.projectId ?? detailPathMatch?.[1] ?? null;
  const tabParam = (detailMatch?.params?.tab ?? params.tab ?? detailPathMatch?.[2]) as ProjectTabRoute | undefined;
  const validTabs: ProjectTabRoute[] = [
    "knowledge",
    "roadmap",
    "prototypes",
    "tasks",
    "prd",
    "members",
    "strategy",
    "assistant",
  ];
  const projectDetailTab = tabParam && validTabs.includes(tabParam) ? tabParam : undefined;
  const focusPrdId = searchParams.get("focus_prd");
  const focusSectionParam = searchParams.get("focus_section");
  const focusSection = focusSectionParam === "decision" ? "decision" : undefined;
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
  const filteredProjects = useMemo(() => {
    const trimmed = projectSearch.trim().toLowerCase();
    if (!trimmed) return sortedProjects;
    return sortedProjects.filter((project) => {
      const title = project.title?.toLowerCase() || "";
      const description = project.description?.toLowerCase() || "";
      const goals = project.goals?.toLowerCase() || "";
      return title.includes(trimmed) || description.includes(trimmed) || goals.includes(trimmed);
    });
  }, [projectSearch, sortedProjects]);

  const formatUpdatedAt = (iso?: string | null) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

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

  const handleResendInvitation = useCallback(
    async (invitationId: string) => {
      if (!workspaceId || !userId) return;
      setMembersError(null);
      setMembersSuccess(null);
      try {
        await resendWorkspaceInvitation(workspaceId, invitationId, userId);
        setMembersSuccess("Invitation resent.");
        await refreshMembers();
      } catch (err: any) {
        setMembersError(err.message || "Failed to resend invitation.");
      }
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
        initialFocusedPrdId={focusPrdId}
        initialFocusSection={focusSection}
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
        {false && (
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
                        onClick={() => navigate(`/workspaces/${ws.id}/knowledge`)}
                        className="mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold text-slate-500 transition hover:bg-slate-100"
                      >
                        Knowledge Base
                      </button>
                      <button
                        onClick={() => handleWorkspaceNavigation(ws, "templates")}
                        className="mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold text-slate-500 transition hover:bg-slate-100"
                      >
                        Template Library
                      </button>
                      <button
                        onClick={() => navigate(`/workspaces/${ws.id}/agents`)}
                        className="mt-1 block w-full rounded-full px-3 py-1 text-left font-semibold text-slate-500 transition hover:bg-slate-100"
                      >
                        Agents
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
        )}

        <main className="flex-1 bg-slate-50">
          {isProjectsView ? (
            <div className="min-h-screen bg-white">
              <header className="border-b border-[#e5e7eb]">
                <div className="px-8 py-4">
                  <div className="flex h-[48px] items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        className="flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                        onClick={() => {
                          if (workspaceId) {
                            navigate(`/workspaces/${workspaceId}/home`);
                            return;
                          }
                          navigate(-1);
                        }}
                      >
                        <BackChevronIcon />
                        Back
                      </button>
                      <div className="h-6 w-px bg-[#d1d5dc]" />
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f3e8ff]">
                          <img alt="" className="h-5 w-5" src={projectsHeaderIcon} />
                        </div>
                        <div>
                          <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">Projects</p>
                          <p className="text-[14px] text-[#6a7282]">{projects.length} total projects</p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[14px] font-medium tracking-[-0.1504px] text-white disabled:opacity-60"
                      onClick={() => {
                        if (canEditWorkspace && workspaceId) {
                          navigate(`/workspaces/${workspaceId}/projects/new`);
                        }
                      }}
                      disabled={!canEditWorkspace}
                    >
                      <img alt="" className="h-4 w-4" src={projectsPlusIcon} />
                      New Project
                    </button>
                  </div>
                </div>
              </header>

              <div className="border-b border-[#e5e7eb] bg-white px-8 py-4">
                <div className="relative flex h-9 w-full max-w-[448px] items-center rounded-[8px] bg-[#f3f3f5] pl-9 pr-3 text-[14px] text-[#717182]">
                  <img alt="" className="absolute left-3 h-4 w-4" src={projectsSearchIcon} />
                  <input
                    className="w-full bg-transparent text-[14px] text-[#101828] outline-none placeholder:text-[#717182]"
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="min-h-[calc(100vh-150px)] bg-[#f9fafb] px-8 py-8">
                {loading ? (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-6 py-4 text-[14px] text-[#6a7282]">
                    Loading projects...
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="flex min-h-[520px] items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white">
                    <div className="flex w-full max-w-[384px] flex-col items-center text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f3e8ff]">
                        <img alt="" className="h-10 w-10" src={projectsEmptyIcon} />
                      </div>
                      <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                        No projects yet
                      </h2>
                      <p className="mt-2 text-[14px] text-[#6a7282]">
                        Projects help you organize your PRDs, roadmaps, and tasks in one place. Create your first project to
                        get started.
                      </p>
                      <button
                        type="button"
                        className="mt-6 flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium tracking-[-0.1504px] text-white disabled:opacity-60"
                        onClick={() => {
                          if (canEditWorkspace && workspaceId) {
                            navigate(`/workspaces/${workspaceId}/projects/new`);
                          }
                        }}
                        disabled={!canEditWorkspace}
                      >
                        <img alt="" className="h-4 w-4" src={projectsPlusIcon} />
                        Create Your First Project
                      </button>
                      {!canEditWorkspace && (
                        <p className="mt-2 text-xs text-slate-500">Ask an admin to add one.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-[14px] text-[#4a5565]">
                        <thead className="bg-[#f9fafb] text-[12px] font-semibold uppercase tracking-[0.6px] text-[#4a5565]">
                          <tr className="border-b border-[#e5e7eb]">
                            <th className="px-6 py-3">Project Name</th>
                            <th className="px-6 py-3">Description</th>
                            <th className="px-6 py-3">PRDs</th>
                            <th className="px-6 py-3">Tasks</th>
                            <th className="px-6 py-3">Last Updated</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProjects.map((project, index) => {
                            const fallbackColor = PROJECT_ROW_COLORS[index % PROJECT_ROW_COLORS.length];
                            const color = project.color || fallbackColor;
                            const prdCount = project.prd_count ?? 0;
                            const taskCount = project.task_count ?? 0;
                            const lastUpdated = formatUpdatedAt(project.last_updated ?? project.created_at);
                            return (
                              <tr
                                key={project.id}
                                className="cursor-pointer border-b border-[#e5e7eb] last:border-b-0"
                                onClick={() => {
                                  if (!workspaceId) return;
                                  navigate(`/workspaces/${workspaceId}/projects/edit/${project.id}`);
                                }}
                              >
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-3">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-[16px] font-medium tracking-[-0.3125px] text-[#101828]">
                                      {project.title}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-5">
                                  <p className="max-w-[420px] text-[14px] leading-[20px] text-[#4a5565]">
                                    {project.description}
                                  </p>
                                </td>
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-1.5">
                                    <img alt="" className="h-4 w-4" src={projectsPrdIcon} />
                                    <span>{prdCount}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-1.5">
                                    <img alt="" className="h-4 w-4" src={projectsTaskIcon} />
                                    <span>{taskCount}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-5">
                                  <div className="flex items-center gap-1.5">
                                    <img alt="" className="h-4 w-4" src={projectsClockIcon} />
                                    <span>{lastUpdated}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-right">
                                  {canEditWorkspace && (
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-9 items-center justify-center rounded-[8px]"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDelete(project.id);
                                      }}
                                    >
                                      <img alt="" className="h-4 w-4" src={projectsDeleteIcon} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between px-6 py-4 text-[14px] text-[#4a5565]">
                      <span>
                        Showing 1-{Math.min(filteredProjects.length, 5)} of {filteredProjects.length} projects
                      </span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-[#4a5565]">Rows per page:</span>
                          <div className="flex h-[33px] w-[64px] items-center justify-center rounded-[10px] border border-[#d1d5dc] bg-white text-[14px] text-[#0a0a0a]">
                            5
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] opacity-50"
                          >
                            <div className="relative h-4 w-4">
                              <img alt="" className="absolute inset-0 h-4 w-4" src={projectsPageDoublePrevIcon} />
                            </div>
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] opacity-50"
                          >
                            <img alt="" className="h-4 w-4" src={projectsPagePrevIcon} />
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white"
                          >
                            1
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] opacity-50"
                          >
                            <img alt="" className="h-4 w-4" src={projectsPageNextIcon} />
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] opacity-50"
                          >
                            <div className="relative h-4 w-4">
                              <img alt="" className="absolute inset-0 h-4 w-4" src={projectsPageDoubleNextIcon} />
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`${WIDE_PAGE_CONTAINER} py-6 md:py-10`}>
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className={SECTION_LABEL}>Workspace</p>
                  <h1 className="text-3xl font-semibold text-slate-900">{workspaceName || "Workspace"}</h1>
                  <p className="text-sm text-slate-500">
                    Workspace settings → Members. Manage roles and invitations.
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

              {workspaces.length > 0 && workspaceId && (
                <div className="mt-4 w-full max-w-xs">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Switch workspace
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
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 focus:border-blue-500 focus:outline-none"
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

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
                onResendInvitation={handleResendInvitation}
                onRoleChange={handleMemberRoleChange}
                onRemoveMember={handleRemoveMember}
              />
            </div>
          )}
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
