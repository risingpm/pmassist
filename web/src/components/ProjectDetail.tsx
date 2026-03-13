import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import SafeMarkdown from "./SafeMarkdown";
import PRDList from "./PRDList";
import PRDDetail from "./PRDDetail";
import ProjectComments from "./ProjectComments";
import ProjectLinks from "./ProjectLinks";
import ProjectPrototypes from "./ProjectPrototypes";
import ProjectPrototypeAgent from "./ProjectPrototypeAgent";
import ProjectMembersPanel from "./ProjectMembersPanel";
import UploadEntryModal from "./UploadEntryModal";
import ContextUsedPanel from "./ContextUsedPanel";
import VerificationNotice from "./VerificationNotice";
import KanbanBoard, {
  KANBAN_STATUSES,
  type KanbanMovePayload,
} from "./tasks/KanbanBoard";
import TaskForm from "./tasks/TaskForm";
import TaskDetailDrawer from "./tasks/TaskDetailDrawer";
import GenerateTasksModal from "./tasks/GenerateTasksModal";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import RoadmapPreviewCard from "./RoadmapPreview";
import AgentAvatar from "./AgentAvatar";
import useAgentName from "../hooks/useAgentName";
import TemplatePickerModal from "./templates/TemplatePickerModal";
import RoadmapPhaseView from "./roadmap/RoadmapPhaseView";
import ReprioritizeSuggestions from "./roadmap/ReprioritizeSuggestions";
import ExecutionInsightsDashboard from "./roadmap/ExecutionInsightsDashboard";
import {
  getProject,
  fetchRoadmap as fetchSavedRoadmap,
  updateRoadmap,
  updateProject,
  getProjectComments,
  createProjectComment,
  updateProjectComment,
  deleteProjectComment,
  getProjectLinks,
  createProjectLink,
  deleteProjectLink,
  getPrototypes,
  generatePrototype,
  generatePrototypeBatch,
  deletePrototype,
  deleteAllPrototypes,
  getPrototypeSessions,
  createPrototypeSession,
  sendPrototypeAgentMessage,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listTaskComments,
  addTaskComment,
  generateTasksFromAI,
  listKnowledgeBaseEntries,
  createKnowledgeBaseEntry,
  uploadKnowledgeBaseEntry,
  searchKnowledgeBase,
  knowledgeEntryDownloadUrl,
  sendRoadmapChatTurn,
  listProjectChats,
  getWorkspaceAgents,
  getProjectAgents,
  assignProjectAgents,
} from "../api";
import type {
  ChatMessage,
  ProjectComment,
  ProjectRole,
  ProjectLink,
  PrototypeSession,
  Prototype,
  WorkspaceRole,
  KnowledgeBaseContextItem,
  KnowledgeBaseEntry,
  KnowledgeBaseEntryType,
  KnowledgeBaseEntryPayload,
  KnowledgeSearchResult,
  TaskRecord,
  TaskStatus,
  TaskPayload,
  TaskComment,
  TaskGenerationItem,
  TemplateRecord,
  VerificationDetails,
  WorkspaceAgent,
  RoadmapChatSession,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY } from "../constants";
import { useUserRole } from "../context/RoleContext";
import ProjectStrategistPanel from "./strategy/ProjectStrategistPanel";
import {
  SECTION_LABEL,
  PRIMARY_BUTTON,
  BODY_SUBTLE,
} from "../styles/theme";

function formatRoadmapForDisplay(content: string): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  try {
    const payload = JSON.parse(trimmed);
    const lines: string[] = [];

    const existing = payload.existing_features || payload.existing || {};
    if (existing && Object.keys(existing).length > 0) {
      lines.push("## Existing Features\n");
      Object.entries(existing).forEach(([category, items]) => {
        lines.push(`### ${category}`);
        (items as string[]).forEach((item) => {
          lines.push(`- ${item}`);
        });
        lines.push("");
      });
    }

    const roadmap = payload.roadmap || payload.phases || [];
    if (roadmap && Array.isArray(roadmap)) {
      lines.push("## Roadmap\n");
      roadmap.forEach((phase: any) => {
        const phaseName = phase.phase || phase.name || "Phase";
        lines.push(`### ${phaseName}`);
        (phase.items || []).forEach((item: string) => {
          lines.push(`- ${item}`);
        });
        lines.push("");
      });
    }

    if (lines.length === 0) {
      return trimmed;
    }

    return lines.join("\n").trim();
  } catch (err) {
    console.warn("Unable to parse roadmap JSON, showing raw content.", err);
    return trimmed;
  }
}

type ProjectTab =
  | "knowledge"
  | "roadmap"
  | "prototypes"
  | "tasks"
  | "prd"
  | "agents"
  | "members"
  | "strategy"
  | "assistant";

const PROJECT_TABS: Array<{ id: ProjectTab; label: string }> = [
  { id: "knowledge", label: "Knowledge" },
  { id: "roadmap", label: "Roadmap" },
  { id: "prototypes", label: "Prototypes" },
  { id: "tasks", label: "Tasks" },
  { id: "prd", label: "PRDs" },
  { id: "agents", label: "Agents" },
  { id: "members", label: "Members" },
  { id: "strategy", label: "Strategy" },
  { id: "assistant", label: "Assistant" },
];

type ProjectDetailProps = {
  projectId: string;
  workspaceId: string | null;
  workspaceRole: WorkspaceRole;
  onProjectUpdated: (project: {
    id: string;
    title: string;
    description: string;
    goals: string;
    north_star_metric?: string | null;
    target_personas?: string[] | null;
    website_url?: string | null;
  }) => void;
  onBack: () => void;
  onOpenKnowledgeBase?: () => void;
  initialTab?: ProjectTab;
  onTabChange?: (tab: ProjectTab) => void;
  initialFocusedPrdId?: string | null;
  initialFocusSection?: "decision" | null;
};

type RoadmapPreview = {
  content: string;
  updated_at: string;
};

const ROADMAP_CHAT_PROMPTS = [
  "Generate a three-phase roadmap for the next release.",
  "Emphasize onboarding and activation metrics in Phase 1.",
  "Add competitive benchmarking work to the next roadmap.",
];

const buildGroupedTasks = (
  taskList: TaskRecord[],
): Record<TaskStatus, TaskRecord[]> => {
  const grouped: Record<TaskStatus, TaskRecord[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  taskList.forEach((task) => {
    grouped[task.status].push(task);
  });
  return grouped;
};

const reorderTasksForKanban = (
  taskList: TaskRecord[],
  move: KanbanMovePayload,
): TaskRecord[] => {
  const grouped = buildGroupedTasks(taskList);
  const sourceColumn = [...grouped[move.sourceStatus]];
  if (!sourceColumn[move.sourceIndex]) {
    return taskList;
  }
  const sameColumn = move.sourceStatus === move.destinationStatus;
  const destinationColumn = sameColumn
    ? sourceColumn
    : [...grouped[move.destinationStatus]];

  const [movedTask] = sourceColumn.splice(move.sourceIndex, 1);
  if (!movedTask) {
    return taskList;
  }

  const updatedTask = sameColumn
    ? movedTask
    : { ...movedTask, status: move.destinationStatus };
  const insertionIndex = Math.min(
    move.destinationIndex,
    destinationColumn.length,
  );
  destinationColumn.splice(insertionIndex, 0, updatedTask);

  return KANBAN_STATUSES.flatMap((status) => {
    if (status === move.sourceStatus || status === move.destinationStatus) {
      const column =
        status === move.sourceStatus ? sourceColumn : destinationColumn;
      return column;
    }
    return grouped[status];
  });
};

export default function ProjectDetail({
  projectId,
  workspaceId,
  workspaceRole,
  onProjectUpdated,
  onBack,
  onOpenKnowledgeBase,
  initialTab,
  onTabChange,
  initialFocusedPrdId,
  initialFocusSection,
}: ProjectDetailProps) {
  const navigate = useNavigate();
  const { projectRoles, refreshProjectRole } = useUserRole();
  const userId = useMemo(() => {
    if (typeof window === "undefined") {
      return (
        (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined) ?? null
      );
    }

    const authRaw = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (authRaw) {
      try {
        const parsed = JSON.parse(authRaw) as { id?: string };
        if (parsed?.id) {
          return parsed.id;
        }
      } catch {
        // ignore parsing errors and fall through
      }
    }
    return (
      window.sessionStorage.getItem(USER_ID_KEY) ||
      (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined) ||
      null
    );
  }, []);

  const effectiveWorkspaceId = useMemo(() => {
    if (workspaceId) return workspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [workspaceId]);
  const [projectRole, setProjectRole] = useState<ProjectRole>(() => {
    const cached = projectRoles[projectId];
    if (cached) return cached;
    if (workspaceRole === "admin") return "owner";
    if (workspaceRole === "editor") return "contributor";
    return "viewer";
  });
  const canEditProject =
    projectRole === "owner" || projectRole === "contributor";
  const canManageTasks =
    workspaceRole === "admin" || workspaceRole === "editor";
  const canEditKnowledgeBase = canManageTasks;

  const [projectInfo, setProjectInfo] = useState<{
    title: string;
    description: string;
    goals: string;
    north_star_metric?: string | null;
    target_personas?: string[] | null;
    website_url?: string | null;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<ProjectTab>("knowledge");
  const [knowledgeTab, setKnowledgeTab] = useState<
    "documents" | "comments" | "links" | "insights"
  >("documents");
  const [projectEntries, setProjectEntries] = useState<KnowledgeBaseEntry[]>(
    [],
  );
  const [projectEntriesLoading, setProjectEntriesLoading] = useState(false);
  const [projectEntriesError, setProjectEntriesError] = useState<string | null>(
    null,
  );
  const [projectEntryType, setProjectEntryType] = useState<
    KnowledgeBaseEntryType | "all"
  >("all");
  const [projectEntrySearch, setProjectEntrySearch] = useState("");
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [projectEntriesSemantic, setProjectEntriesSemantic] = useState(false);
  const projectEntryFilters = useMemo<
    Array<{ id: KnowledgeBaseEntryType | "all"; label: string }>
  >(
    () => [
      { id: "all", label: "All" },
      { id: "document", label: "Documents" },
      { id: "repo", label: "Repos" },
      { id: "research", label: "Research" },
      { id: "insight", label: "Insights" },
      { id: "prd", label: "PRDs" },
      { id: "ai_output", label: "AI outputs" },
    ],
    [],
  );
  const [selectedPrd, setSelectedPrd] = useState<{
    projectId: string;
    prdId: string;
  } | null>(null);

  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [loadingPrototypes, setLoadingPrototypes] = useState(false);
  const [generatingPrototype, setGeneratingPrototype] = useState(false);
  const [deletingAllPrototypes, setDeletingAllPrototypes] = useState(false);
  const [prototypeSession, setPrototypeSession] =
    useState<PrototypeSession | null>(null);
  const [loadingPrototypeSession, setLoadingPrototypeSession] = useState(false);
  const [prototypeSessionError, setPrototypeSessionError] = useState<
    string | null
  >(null);
  const [sendingPrototypeMessage, setSendingPrototypeMessage] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
  const [infoPanelsVisible, setInfoPanelsVisible] = useState(false);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);

  const showRoadmapSidebar = activeTab === "roadmap";
  const gridTemplateClasses = useMemo(() => {
    if (showRoadmapSidebar) {
      return infoPanelsVisible
        ? "lg:grid-cols-[340px,minmax(0,1fr),280px]"
        : "lg:grid-cols-[minmax(0,1fr),280px]";
    }
    return infoPanelsVisible
      ? "lg:grid-cols-[340px,minmax(0,1fr)]"
      : "lg:grid-cols-1";
  }, [infoPanelsVisible, showRoadmapSidebar]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [generateTasksOpen, setGenerateTasksOpen] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [taskDeleting, setTaskDeleting] = useState(false);

  // Roadmap interaction state
  const [roadmapChatId, setRoadmapChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([]);
  const [chatContextEntries, setChatContextEntries] = useState<
    KnowledgeBaseContextItem[]
  >([]);
  const [chatVerification, setChatVerification] =
    useState<VerificationDetails | null>(null);
  const [chatRoadmapContent, setChatRoadmapContent] = useState<string | null>(
    null,
  );
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessions, setChatSessions] = useState<RoadmapChatSession[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false);
  const [chatSessionsError, setChatSessionsError] = useState<string | null>(
    null,
  );
  const [chatExpanded, setChatExpanded] = useState(false);
  const [roadmapTemplate, setRoadmapTemplate] = useState<TemplateRecord | null>(
    null,
  );
  const [roadmapTemplateModalOpen, setRoadmapTemplateModalOpen] =
    useState(false);
  const [availableAgents, setAvailableAgents] = useState<WorkspaceAgent[]>([]);
  const [projectAgents, setProjectAgents] = useState<WorkspaceAgent[]>([]);
  const [assignAgentsOpen, setAssignAgentsOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const initialPrdAppliedRef = useRef<string | null>(null);

  const [roadmapPreview, setRoadmapPreview] = useState<RoadmapPreview | null>(
    null,
  );
  const [isEditingRoadmap, setIsEditingRoadmap] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingRoadmap, setSavingRoadmap] = useState(false);
  const [roadmapRefreshKey, setRoadmapRefreshKey] = useState(0);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectSaveMessage, setProjectSaveMessage] = useState<string | null>(
    null,
  );
  const [projectForm, setProjectForm] = useState({
    title: "",
    description: "",
    goals: "",
    north_star_metric: "",
    target_personas: "",
    website_url: "",
  });
  const agentName = useAgentName();
  const handleRoadmapRefresh = useCallback(() => {
    setRoadmapRefreshKey((prev) => prev + 1);
  }, []);

  const roadmapBriefContent = useMemo(() => {
    if (!roadmapPreview) return "";
    return formatRoadmapForDisplay(
      typeof roadmapPreview.content === "string"
        ? roadmapPreview.content
        : JSON.stringify(roadmapPreview.content ?? "", null, 2),
    );
  }, [roadmapPreview]);

  const roadmapBriefIsHtml = useMemo(() => {
    if (!roadmapBriefContent) return false;
    const htmlPattern = /<\/?[a-z][\s\S]*>/i;
    return htmlPattern.test(roadmapBriefContent);
  }, [roadmapBriefContent]);

  const loadProjectAgents = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    try {
      const [workspaceAgents, assigned] = await Promise.all([
        getWorkspaceAgents(effectiveWorkspaceId),
        getProjectAgents(effectiveWorkspaceId, projectId),
      ]);
      setAvailableAgents(workspaceAgents);
      setProjectAgents(assigned);
    } catch (err) {
      console.warn("Failed to load agents", err);
    }
  }, [effectiveWorkspaceId, projectId]);

  const lastInitialTabRef = useRef<ProjectTab | null>(null);
  useEffect(() => {
    if (!initialTab) {
      lastInitialTabRef.current = null;
      return;
    }
    if (lastInitialTabRef.current === initialTab) return;
    lastInitialTabRef.current = initialTab;
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    initialPrdAppliedRef.current = null;
  }, [projectId]);
  useEffect(() => {
    if (infoPanelsVisible) {
      setInfoDrawerOpen(false);
    }
  }, [infoPanelsVisible]);

  useEffect(() => {
    if (!initialFocusedPrdId) return;
    if (initialPrdAppliedRef.current === initialFocusedPrdId) return;
    initialPrdAppliedRef.current = initialFocusedPrdId;
    setActiveTab("prd");
    setSelectedPrd({ projectId, prdId: initialFocusedPrdId });
  }, [initialFocusedPrdId, projectId]);

  useEffect(() => {
    if (onTabChange) {
      onTabChange(activeTab);
    }
  }, [activeTab, onTabChange]);

  useEffect(() => {
    const cached = projectRoles[projectId];
    if (cached) {
      setProjectRole(cached);
    }
  }, [projectId, projectRoles]);

  useEffect(() => {
    if (projectRoles[projectId]) return;
    if (workspaceRole === "admin") {
      setProjectRole("owner");
    } else if (workspaceRole === "editor") {
      setProjectRole("contributor");
    } else {
      setProjectRole("viewer");
    }
  }, [workspaceRole, projectId, projectRoles]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    refreshProjectRole(projectId, workspaceId, userId)
      .then(setProjectRole)
      .catch((err) => console.warn("Failed to refresh project role", err));
  }, [projectId, workspaceId, userId, refreshProjectRole]);

  useEffect(() => {
    if (assignAgentsOpen) {
      setSelectedAgentIds(projectAgents.map((agent) => agent.id));
    }
  }, [assignAgentsOpen, projectAgents]);

  const resetChatState = () => {
    setRoadmapChatId(null);
    setChatMessages([]);
    setChatSuggestions([]);
    setChatContextEntries([]);
    setChatRoadmapContent(null);
    setChatError(null);
    setChatVerification(null);
  };

  useEffect(() => {
    if (!projectInfo) return;
    setProjectForm({
      title: projectInfo.title,
      description: projectInfo.description,
      goals: projectInfo.goals,
      north_star_metric: projectInfo.north_star_metric || "",
      target_personas: (projectInfo.target_personas || []).join(", "),
      website_url: projectInfo.website_url || "",
    });
  }, [projectInfo]);

  // ------------------- Project knowledge handlers -------------------
  const loadProjectEntries = useCallback(async () => {
    if (!effectiveWorkspaceId) {
      setProjectEntries([]);
      setProjectEntriesSemantic(false);
      return;
    }
    setProjectEntriesLoading(true);
    setProjectEntriesError(null);
    try {
      const trimmedSearch = projectEntrySearch.trim();
      const useSemantic = trimmedSearch.length >= 3;
      if (useSemantic) {
        const semanticResults = await searchKnowledgeBase(
          effectiveWorkspaceId,
          trimmedSearch,
          projectEntryType === "all" ? undefined : projectEntryType,
          userId ?? undefined,
          projectId,
        );
        const normalized: KnowledgeBaseEntry[] = semanticResults.map(
          (result: KnowledgeSearchResult) => ({
            id: result.id,
            kb_id: effectiveWorkspaceId,
            type: result.type,
            title: result.title || "Untitled entry",
            content: result.content || "",
            file_url: null,
            source_url: null,
            created_by: null,
            created_by_email: null,
            project_id: result.project_id ?? projectId ?? null,
            tags: result.tags ?? [],
            created_at: result.uploaded_at,
            updated_at: result.uploaded_at,
          }),
        );
        setProjectEntries(normalized);
        setProjectEntriesSemantic(true);
      } else {
        const filters: {
          type?: KnowledgeBaseEntryType;
          search?: string;
          projectId?: string;
        } = { projectId };
        if (projectEntryType !== "all") {
          filters.type = projectEntryType;
        }
        if (trimmedSearch) {
          filters.search = trimmedSearch;
        }
        const list = await listKnowledgeBaseEntries(
          effectiveWorkspaceId,
          filters,
          userId ?? undefined,
        );
        setProjectEntries(list);
        setProjectEntriesSemantic(false);
      }
    } catch (err: any) {
      setProjectEntriesError(
        err.message || "Failed to load project knowledge entries.",
      );
    } finally {
      setProjectEntriesLoading(false);
    }
  }, [
    effectiveWorkspaceId,
    projectEntryType,
    projectEntrySearch,
    projectId,
    userId,
  ]);

  useEffect(() => {
    if (knowledgeTab !== "documents") return;
    loadProjectEntries();
  }, [knowledgeTab, loadProjectEntries]);

  const handleCreateProjectEntry = async (
    payload: KnowledgeBaseEntryPayload,
  ) => {
    if (!effectiveWorkspaceId) return;
    const finalPayload = {
      ...payload,
      project_id: payload.project_id ?? projectId,
    };
    await createKnowledgeBaseEntry(
      effectiveWorkspaceId,
      finalPayload,
      userId ?? undefined,
    );
    await loadProjectEntries();
  };

  const handleUploadProjectEntry = async (
    file: File,
    payload: {
      type: KnowledgeBaseEntryType;
      title?: string;
      tags?: string[];
      project_id?: string | null;
    },
  ) => {
    if (!effectiveWorkspaceId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entry_type", payload.type);
    if (payload.title) formData.append("title", payload.title);
    if (payload.tags?.length) formData.append("tags", payload.tags.join(","));
    const nextProjectId = payload.project_id ?? projectId;
    if (nextProjectId) {
      formData.append("project_id", nextProjectId);
    }
    await uploadKnowledgeBaseEntry(
      effectiveWorkspaceId,
      formData,
      userId ?? undefined,
    );
    await loadProjectEntries();
  };

  // ------------------- Comment handlers -------------------
  const loadComments = async () => {
    if (!effectiveWorkspaceId) {
      setComments([]);
      return;
    }

    setLoadingComments(true);
    try {
      const data = await getProjectComments(projectId, effectiveWorkspaceId);
      setComments(data);
    } catch (err) {
      console.error("Failed to fetch project comments", err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleCreateComment = async (content: string, tags: string[]) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await createProjectComment(projectId, effectiveWorkspaceId, {
      content,
      tags: tags.length > 0 ? tags : undefined,
      author_id: userId ?? null,
    });
    await loadComments();
  };

  const handleUpdateComment = async (
    id: string,
    content: string,
    tags: string[],
  ) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await updateProjectComment(projectId, effectiveWorkspaceId, id, {
      content,
      tags: tags.length > 0 ? tags : [],
    });
    await loadComments();
  };

  const handleDeleteComment = async (id: string) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await deleteProjectComment(projectId, effectiveWorkspaceId, id);
    await loadComments();
  };

  // ------------------- Link handlers -------------------
  const loadLinks = async () => {
    if (!effectiveWorkspaceId) {
      setLinks([]);
      return;
    }

    setLoadingLinks(true);
    try {
      const data = await getProjectLinks(projectId, effectiveWorkspaceId);
      setLinks(data);
    } catch (err) {
      console.error("Failed to fetch project links", err);
    } finally {
      setLoadingLinks(false);
    }
  };

  const handleCreateLink = async (payload: {
    label: string;
    url: string;
    description?: string;
    tags?: string[];
  }) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await createProjectLink(projectId, {
      ...payload,
      workspace_id: effectiveWorkspaceId,
    });
    await loadLinks();
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await deleteProjectLink(projectId, effectiveWorkspaceId, linkId);
    await loadLinks();
  };

  const loadPrototypes = async () => {
    if (!effectiveWorkspaceId) {
      setPrototypes([]);
      return;
    }
    setLoadingPrototypes(true);
    try {
      const data = await getPrototypes(projectId, effectiveWorkspaceId);
      setPrototypes(data);
    } catch (err) {
      console.error("Failed to fetch prototypes", err);
    } finally {
      setLoadingPrototypes(false);
    }
  };

  const loadTasks = useCallback(async () => {
    if (!effectiveWorkspaceId || !userId) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const list = await listTasks(effectiveWorkspaceId, userId, projectId);
      setTasks(list);
    } catch (err: any) {
      setTasksError(err.message || "Failed to load tasks.");
    } finally {
      setTasksLoading(false);
    }
  }, [effectiveWorkspaceId, userId, projectId]);

  const handleGeneratePrototype = async ({
    phase,
    focus,
    count,
  }: {
    phase: string;
    focus: string;
    count: number;
  }) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    setGeneratingPrototype(true);
    try {
      const normalizedCount = Math.max(1, count || 1);
      const requestPayload = {
        phase: phase || undefined,
        focus: focus || undefined,
        count: normalizedCount,
      };
      if (normalizedCount > 1) {
        await generatePrototypeBatch(
          projectId,
          effectiveWorkspaceId,
          requestPayload,
        );
      } else {
        await generatePrototype(
          projectId,
          effectiveWorkspaceId,
          requestPayload,
        );
      }
      await Promise.all([loadPrototypes(), loadPrototypeSessions()]);
    } catch (err) {
      throw err;
    } finally {
      setGeneratingPrototype(false);
    }
  };

  const handleDeletePrototype = async (prototypeId: string) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    await deletePrototype(projectId, effectiveWorkspaceId, prototypeId);
    await Promise.all([loadPrototypes(), loadPrototypeSessions()]);
  };

  const handleDeleteAllPrototypes = async () => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    setDeletingAllPrototypes(true);
    try {
      await deleteAllPrototypes(projectId, effectiveWorkspaceId, true);
      setPrototypeSession(null);
      await Promise.all([loadPrototypes(), loadPrototypeSessions()]);
    } catch (err) {
      console.error("Failed to delete prototypes", err);
      throw err;
    } finally {
      setDeletingAllPrototypes(false);
    }
  };

  const loadPrototypeSessions = async () => {
    if (!effectiveWorkspaceId) {
      setPrototypeSession(null);
      return;
    }

    setPrototypeSessionError(null);
    setLoadingPrototypeSession(true);
    try {
      const sessions = await getPrototypeSessions(
        projectId,
        effectiveWorkspaceId,
      );
      setPrototypeSession(sessions.length > 0 ? sessions[0] : null);
    } catch (err) {
      console.error("Failed to fetch prototype sessions", err);
      setPrototypeSessionError(
        err instanceof Error
          ? err.message
          : "Unable to load prototype sessions",
      );
    } finally {
      setLoadingPrototypeSession(false);
    }
  };

  const handleStartPrototypeSession = async (prompt: string) => {
    if (!effectiveWorkspaceId) {
      throw new Error("Missing workspace context");
    }

    setPrototypeSessionError(null);
    setLoadingPrototypeSession(true);
    try {
      const session = await createPrototypeSession(
        projectId,
        effectiveWorkspaceId,
        prompt,
      );
      setPrototypeSession(session);
      await loadPrototypes();
    } catch (err) {
      console.error("Failed to start prototype session", err);
      setPrototypeSessionError(
        err instanceof Error
          ? err.message
          : "Unable to start prototype session",
      );
      throw err;
    } finally {
      setLoadingPrototypeSession(false);
    }
  };

  const handleSendPrototypeMessage = async (message: string) => {
    if (!effectiveWorkspaceId || !prototypeSession) {
      throw new Error("Missing session context");
    }

    setPrototypeSessionError(null);
    setSendingPrototypeMessage(true);
    try {
      const updated = await sendPrototypeAgentMessage(
        projectId,
        prototypeSession.id,
        effectiveWorkspaceId,
        message,
      );
      setPrototypeSession(updated);
      await loadPrototypes();
    } catch (err) {
      console.error("Failed to send prototype agent message", err);
      setPrototypeSessionError(
        err instanceof Error ? err.message : "Unable to send agent message",
      );
      throw err;
    } finally {
      setSendingPrototypeMessage(false);
    }
  };

  const handleSubmitTask = async (payload: TaskPayload) => {
    if (!effectiveWorkspaceId || !userId) {
      throw new Error("Workspace context missing.");
    }
    setTasksError(null);
    const payloadWithProject: TaskPayload = {
      ...payload,
      project_id: payload.project_id ?? editingTask?.project_id ?? projectId,
    };
    try {
      if (editingTask) {
        await updateTask(
          editingTask.id,
          effectiveWorkspaceId,
          userId,
          payloadWithProject,
        );
      } else {
        await createTask(effectiveWorkspaceId, userId, payloadWithProject);
      }
      await loadTasks();
    } catch (err: any) {
      setTasksError(err.message || "Failed to save task.");
      throw err;
    } finally {
      setEditingTask(null);
    }
  };

  const handleTaskMove = async (move: KanbanMovePayload) => {
    if (!effectiveWorkspaceId || !userId || !canManageTasks) return;
    let rollbackValue: TaskRecord[] = [];
    setTasks((prev) => {
      rollbackValue = prev;
      return reorderTasksForKanban(prev, move);
    });
    if (move.sourceStatus !== move.destinationStatus) {
      try {
        await updateTask(move.taskId, effectiveWorkspaceId, userId, {
          status: move.destinationStatus,
        });
      } catch (err: any) {
        console.warn("Failed to update task status", err);
        setTasks(rollbackValue);
        setTasksError(err?.message || "Failed to update task status.");
      }
    }
  };

  const handleDeleteTask = async (task: TaskRecord) => {
    if (!effectiveWorkspaceId || !userId || !canManageTasks) return;
    setTaskDeleting(true);
    try {
      await deleteTask(task.id, effectiveWorkspaceId, userId);
      setTaskDrawerOpen(false);
      setSelectedTask(null);
      await loadTasks();
    } catch (err: any) {
      setTasksError(err.message || "Failed to delete task.");
    } finally {
      setTaskDeleting(false);
    }
  };

  const loadTaskComments = useCallback(
    async (taskId: string) => {
      if (!effectiveWorkspaceId || !userId) return;
      setTaskCommentsLoading(true);
      try {
        const items = await listTaskComments(
          taskId,
          effectiveWorkspaceId,
          userId,
        );
        setTaskComments(items);
      } catch (err) {
        console.warn("Failed to load task comments", err);
      } finally {
        setTaskCommentsLoading(false);
      }
    },
    [effectiveWorkspaceId, userId],
  );

  const handleAddTaskComment = async (content: string) => {
    if (!selectedTask || !effectiveWorkspaceId || !userId) return;
    setTaskCommentsLoading(true);
    try {
      await addTaskComment(
        selectedTask.id,
        effectiveWorkspaceId,
        userId,
        content,
      );
      await loadTaskComments(selectedTask.id);
    } finally {
      setTaskCommentsLoading(false);
    }
  };

  const handleGenerateTasksRequest = async (instructions: string) => {
    if (!effectiveWorkspaceId || !userId) {
      throw new Error("Workspace context missing.");
    }
    setGeneratingTasks(true);
    try {
      const response = await generateTasksFromAI({
        workspace_id: effectiveWorkspaceId,
        project_id: projectId,
        user_id: userId,
        instructions,
      });
      return response.tasks;
    } finally {
      setGeneratingTasks(false);
    }
  };

  const handleInsertGeneratedTasks = async (items: TaskGenerationItem[]) => {
    if (!effectiveWorkspaceId || !userId) return;
    for (const item of items) {
      await createTask(effectiveWorkspaceId, userId, {
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: item.status,
        project_id: projectId,
      });
    }
    await loadTasks();
  };

  const closeTaskForm = () => {
    setTaskFormOpen(false);
    setEditingTask(null);
  };

  const handleCloseTaskDrawer = () => {
    setTaskDrawerOpen(false);
    setSelectedTask(null);
  };

  const handleSelectTask = (task: TaskRecord) => {
    setSelectedTask(task);
    setTaskDrawerOpen(true);
  };

  const handleEditTask = (task: TaskRecord) => {
    handleCloseTaskDrawer();
    setEditingTask(task);
    setTaskFormOpen(true);
  };

  const knowledgeSummary = useMemo(() => {
    const latestComment = comments.length > 0 ? comments[0] : null;
    const latestLink = links.length > 0 ? links[0] : null;
    const latestPrototype = prototypes.length > 0 ? prototypes[0] : null;
    const documentEntries = projectEntries.filter((entry) =>
      ["document", "repo", "research"].includes(entry.type),
    );
    const latestDocument =
      documentEntries.length > 0 ? documentEntries[0] : null;

    return {
      totalDocuments: documentEntries.length,
      totalDocumentChunks: documentEntries.length,
      latestDocumentUploadedAt: latestDocument
        ? new Date(latestDocument.updated_at).toLocaleString()
        : null,
      totalComments: comments.length,
      latestComment,
      totalLinks: links.length,
      latestLink,
      totalPrototypes: prototypes.length,
      latestPrototype,
    };
  }, [comments, links, prototypes, projectEntries]);

  const taskSummary = useMemo(() => {
    const summary = {
      total: tasks.length,
      todo: 0,
      in_progress: 0,
      done: 0,
    };
    tasks.forEach((task) => {
      if (task.status in summary) {
        summary[task.status as "todo" | "in_progress" | "done"] += 1;
      }
    });
    return summary;
  }, [tasks]);

  // ------------------- Roadmap handlers -------------------
  const loadRoadmap = async () => {
    if (!effectiveWorkspaceId) return;
    try {
      const data = await fetchSavedRoadmap(projectId, effectiveWorkspaceId);
      setRoadmapPreview({ content: data.content, updated_at: data.updated_at });
    } catch {
      setRoadmapPreview(null);
    }
  };

  const handleRoadmapChatSend = async (prompt: string) => {
    if (!canEditProject) {
      setChatError("You have read-only access to this workspace.");
      return;
    }
    if (!effectiveWorkspaceId || !userId) {
      setChatError(
        "Workspace context missing. Return to projects and re-open.",
      );
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      setChatError("Describe what you need from the roadmap.");
      return;
    }

    setChatLoading(true);
    setChatError(null);
    try {
      const response = await sendRoadmapChatTurn({
        workspace_id: effectiveWorkspaceId,
        project_id: projectId,
        prompt: trimmed,
        chat_id: roadmapChatId,
        user_id: userId,
        template_id: roadmapTemplate?.id ?? null,
      });
      setRoadmapChatId(response.id);
      setChatMessages(response.messages);
      setChatSuggestions(response.suggestions ?? []);
      setChatContextEntries(response.context_entries ?? []);
      setChatVerification(response.verification ?? null);
      setChatRoadmapContent(response.roadmap ?? null);
      if (response.roadmap) {
        await loadRoadmap();
        handleRoadmapRefresh();
      }
      refreshChatSessions();
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || "Failed to generate roadmap.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleAssignAgentsSubmit = async () => {
    if (!effectiveWorkspaceId) return;
    try {
      const updated = await assignProjectAgents(
        effectiveWorkspaceId,
        projectId,
        selectedAgentIds,
      );
      setProjectAgents(updated);
      setAssignAgentsOpen(false);
    } catch (err) {
      console.error("Failed to assign agents", err);
    }
  };

  const refreshChatSessions = useCallback(async () => {
    if (!effectiveWorkspaceId) return;
    setChatSessionsLoading(true);
    setChatSessionsError(null);
    try {
      const sessions = await listProjectChats(
        effectiveWorkspaceId,
        projectId,
        userId ?? undefined,
      );
      setChatSessions(sessions);
    } catch (err: any) {
      setChatSessionsError(err.message || "Failed to load conversations.");
    } finally {
      setChatSessionsLoading(false);
    }
  }, [effectiveWorkspaceId, projectId, userId]);

  const handleStartNewConversation = () => {
    resetChatState();
  };

  const handleSelectChatSession = useCallback(
    (session: RoadmapChatSession) => {
      setRoadmapChatId(session.id);
      setChatMessages(session.messages || []);
      setChatSuggestions([]);
      setChatContextEntries([]);
      setChatRoadmapContent(null);
      setChatVerification(null);
      setChatError(null);
    },
    [],
  );

  const handleStartEditingRoadmap = () => {
    if (!roadmapPreview || !canEditProject) return;
    setEditContent(roadmapPreview.content);
    setIsEditingRoadmap(true);
    setSaveMessage(null);
  };

  const handleCancelEditingRoadmap = () => {
    setIsEditingRoadmap(false);
    setSaveMessage(null);
  };

  const handleSaveRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProject) {
      setSaveMessage("You have read-only access to this workspace.");
      return;
    }
    setSavingRoadmap(true);
    setSaveMessage(null);
    try {
      if (!effectiveWorkspaceId) throw new Error("Workspace context missing");
      await updateRoadmap(projectId, effectiveWorkspaceId, editContent);
      setSaveMessage("Roadmap updated.");
      setIsEditingRoadmap(false);
      await loadRoadmap();
      handleRoadmapRefresh();
    } catch (err: any) {
      console.error(err);
      setSaveMessage(err.message || "Failed to save roadmap.");
    } finally {
      setSavingRoadmap(false);
    }
  };

  // ------------------- Lifecycle -------------------
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        if (!effectiveWorkspaceId) return;
        const data = await getProject(projectId, effectiveWorkspaceId);
        setProjectInfo({
          title: data.project.title,
          description: data.project.description,
          goals: data.project.goals,
          north_star_metric: data.project.north_star_metric,
          target_personas: data.project.target_personas,
          website_url: data.project.website_url,
        });
      } catch (err) {
        console.error("Failed to load project info", err);
      }
    };

    fetchProjectInfo();
  }, [projectId, effectiveWorkspaceId, loadProjectAgents]);

  useEffect(() => {
    loadComments();
    loadLinks();
    loadRoadmap();
    loadPrototypes();
    loadProjectAgents();
  }, [projectId, effectiveWorkspaceId]);

  useEffect(() => {
    if (activeTab === "prototypes") {
      loadPrototypeSessions();
    }
  }, [activeTab, projectId, effectiveWorkspaceId]);

  useEffect(() => {
    if (activeTab === "assistant") {
      refreshChatSessions();
    }
  }, [activeTab, refreshChatSessions]);

  useEffect(() => {
    if (activeTab === "tasks") {
      loadTasks();
    }
  }, [activeTab, loadTasks]);

  useEffect(() => {
    if (taskDrawerOpen && selectedTask) {
      loadTaskComments(selectedTask.id);
    } else {
      setTaskComments([]);
      setTaskCommentsLoading(false);
    }
  }, [taskDrawerOpen, selectedTask, loadTaskComments]);

  const projectOverviewCard = projectInfo ? (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400">
        Project Overview
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">
        {projectInfo.title}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{projectInfo.description}</p>
      <div className="mt-5 space-y-4 text-sm text-slate-600">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Goals
          </p>
          <p className="mt-1 text-slate-800">
            {projectInfo.goals || "Not specified"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            KPI: Star Metric
          </p>
          <p className="mt-1 text-slate-800">
            {projectInfo.north_star_metric || "Not specified"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Target Personas
          </p>
          <p className="mt-1 text-slate-800">
            {projectInfo.target_personas &&
            projectInfo.target_personas.length > 0
              ? projectInfo.target_personas.join(", ")
              : "Not specified"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Product website
          </p>
          {projectInfo.website_url ? (
            <a
              href={projectInfo.website_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-blue-600 underline-offset-2 hover:underline"
            >
              {projectInfo.website_url}
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="mt-1 text-slate-800">
              Add a URL so the agent can research your live positioning.
            </p>
          )}
        </div>
      </div>
      <div className="mt-6">
        {canEditProject ? (
          <button
            onClick={() => {
              setProjectSaveMessage(null);
              setIsEditingProject(true);
            }}
            className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Edit project details
          </button>
        ) : (
          <p className="text-xs text-slate-500">
            Viewer access — project settings are locked.
          </p>
        )}
      </div>
    </div>
  ) : (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
      <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
      <div className="h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
      <div className="h-3 w-4/6 rounded bg-slate-100 animate-pulse" />
    </div>
  );

  const pulseCard = (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-6 text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-200">
        Pulse
      </p>
      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-indigo-200 text-xs uppercase tracking-[0.2em]">
            Docs linked
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {knowledgeSummary.totalDocuments}
          </p>
        </div>
        <div>
          <p className="text-indigo-200 text-xs uppercase tracking-[0.2em]">
            Tasks tracked
          </p>
          <p className="mt-2 text-3xl font-semibold">{taskSummary.total}</p>
        </div>
        <div>
          <p className="text-indigo-200 text-xs uppercase tracking-[0.2em]">
            Comments
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {knowledgeSummary.totalComments}
          </p>
        </div>
        <div>
          <p className="text-indigo-200 text-xs uppercase tracking-[0.2em]">
            Prototypes
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {knowledgeSummary.totalPrototypes}
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-1 text-xs text-indigo-100">
        {knowledgeSummary.latestDocumentUploadedAt && (
          <p>Last doc: {knowledgeSummary.latestDocumentUploadedAt}</p>
        )}
        {knowledgeSummary.latestComment && (
          <p>
            Latest note:{" "}
            {new Date(
              knowledgeSummary.latestComment.created_at,
            ).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <button
          onClick={() => setActiveTab("tasks")}
          className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Jump to tasks
        </button>
        <button
          onClick={() => setActiveTab("knowledge")}
          className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          View knowledge
        </button>
      </div>
    </div>
  );

  // ------------------- Render -------------------
  if (!effectiveWorkspaceId) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-500">
          Workspace context missing. Please return to the dashboard and select a
          workspace.
        </p>
        <button
          onClick={onBack}
          className="mt-3 rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#f6f7ff]">
        <div className="px-4 py-8 space-y-4 sm:px-6 lg:px-8 lg:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-white"
            >
              ⬅ Back to Projects
            </button>
            <div className="flex flex-col items-stretch gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/80 px-3 py-1 text-slate-600 shadow-sm">
                  Workspace • {workspaceRole}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1 text-slate-600 shadow-sm">
                  Project • {projectRole}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
                <button
                  onClick={() => setInfoPanelsVisible((prev) => !prev)}
                  aria-pressed={infoPanelsVisible}
                  className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600 shadow-sm transition hover:bg-white"
                >
                  {infoPanelsVisible ? "Collapse context" : "Expand context"}
                </button>
                {!infoPanelsVisible && (
                  <button
                    onClick={() => setInfoDrawerOpen(true)}
                    className="rounded-full bg-slate-900 px-3 py-1 text-white shadow-sm transition hover:bg-slate-800"
                  >
                    View summary
                  </button>
                )}
              </div>
            </div>
          </div>
          {showRoadmapSidebar && (
            <div className="mt-6 space-y-4 lg:hidden">
              <ExecutionInsightsDashboard
                projectId={projectId}
                workspaceId={effectiveWorkspaceId}
                refreshKey={roadmapRefreshKey}
              />
              <ReprioritizeSuggestions
                projectId={projectId}
                workspaceId={effectiveWorkspaceId}
                refreshKey={roadmapRefreshKey}
                onApplied={handleRoadmapRefresh}
              />
            </div>
          )}

          {infoPanelsVisible ? (
            <div className="space-y-6 lg:hidden">
              {projectOverviewCard}
              {pulseCard}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 lg:hidden">
              Project context hidden. Use the toggle above to reopen it.
            </div>
          )}

          <div className={`grid gap-6 ${gridTemplateClasses}`}>
            {infoPanelsVisible && (
              <aside className="hidden space-y-6 lg:flex lg:flex-col">
                {projectOverviewCard}
                {pulseCard}
              </aside>
            )}

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 pb-2 pt-4 sm:px-6">
                <div className="flex flex-wrap gap-2 text-sm font-semibold">
                  {PROJECT_TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative rounded-t-2xl px-4 py-2 transition ${
                          isActive
                            ? "text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute inset-0 rounded-t-2xl bg-slate-900 shadow-md" />
                        )}
                        <span className="relative">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className={`grid gap-8 px-6 py-6 ${
                  showRoadmapSidebar ? "lg:grid-cols-[minmax(0,1fr),280px]" : ""
                }`}
              >
                <div className="space-y-6">
                  {activeTab === "knowledge" && (
                    <section className="space-y-6">
                      <div className="flex flex-wrap gap-4 border-b border-slate-200 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <button
                          onClick={() => setKnowledgeTab("documents")}
                          className={
                            knowledgeTab === "documents"
                              ? "rounded-full bg-blue-50 px-4 py-2 text-blue-600"
                              : "rounded-full px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          Documents
                        </button>
                        <button
                          onClick={() => setKnowledgeTab("comments")}
                          className={
                            knowledgeTab === "comments"
                              ? "rounded-full bg-blue-50 px-4 py-2 text-blue-600"
                              : "rounded-full px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          Comments
                        </button>
                        <button
                          onClick={() => setKnowledgeTab("links")}
                          className={
                            knowledgeTab === "links"
                              ? "rounded-full bg-blue-50 px-4 py-2 text-blue-600"
                              : "rounded-full px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          Links
                        </button>
                        <button
                          onClick={() => setKnowledgeTab("insights")}
                          className={
                            knowledgeTab === "insights"
                              ? "rounded-full bg-blue-50 px-4 py-2 text-blue-600"
                              : "rounded-full px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          }
                        >
                          Insights
                        </button>
                      </div>

                      {knowledgeTab === "documents" && (
                        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h2 className="text-xl font-semibold text-slate-900">
                                Project Knowledge
                              </h2>
                              <p className="mt-1 text-sm text-slate-500">
                                Entries tagged to this project from the
                                workspace Knowledge Base.
                              </p>
                              {!canEditKnowledgeBase && (
                                <p className="mt-2 text-xs text-amber-600">
                                  You have viewer access and cannot upload or
                                  edit entries.
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  if (onOpenKnowledgeBase) {
                                    onOpenKnowledgeBase();
                                  } else {
                                    onBack();
                                  }
                                }}
                                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                Workspace Knowledge Base
                              </button>
                              {canEditKnowledgeBase && (
                                <button
                                  onClick={() => setShowEntryModal(true)}
                                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                >
                                  Add entry
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="flex flex-wrap gap-2">
                              {projectEntryFilters.map((filter) => (
                                <button
                                  key={filter.id}
                                  onClick={() => setProjectEntryType(filter.id)}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                    projectEntryType === filter.id
                                      ? "bg-blue-600 text-white"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  {filter.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 md:ml-auto">
                              <input
                                value={projectEntrySearch}
                                onChange={(event) =>
                                  setProjectEntrySearch(event.target.value)
                                }
                                placeholder="Search this project’s entries..."
                                className="w-full rounded-full border border-slate-200 px-4 py-1 text-sm md:w-64"
                              />
                              <button
                                type="button"
                                onClick={() => loadProjectEntries()}
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                              >
                                Refresh
                              </button>
                            </div>
                          </div>

                          {projectEntriesSemantic &&
                            projectEntrySearch.trim().length >= 3 && (
                              <p className="text-xs text-slate-500">
                                Showing semantic matches for “
                                {projectEntrySearch.trim()}”.
                              </p>
                            )}

                          {projectEntriesError && (
                            <p className="mt-3 text-sm text-rose-600">
                              {projectEntriesError}
                            </p>
                          )}

                          {projectEntriesLoading ? (
                            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                              Loading project entries...
                            </div>
                          ) : projectEntries.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                              No knowledge base entries are tagged to this
                              project yet.
                              {canEditKnowledgeBase &&
                                " Use the button above to add one."}
                            </div>
                          ) : (
                            <div className="mt-4 overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    <th className="pb-3 pr-3">Title</th>
                                    <th className="pb-3 pr-3">Type</th>
                                    <th className="pb-3 pr-3">Tags</th>
                                    <th className="pb-3 pr-3">Updated</th>
                                    <th className="pb-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {projectEntries.map((entry) => (
                                    <tr
                                      key={entry.id}
                                      className="border-t border-slate-100 text-slate-600"
                                    >
                                      <td className="py-3 pr-3">
                                        <p className="font-semibold text-slate-900">
                                          {entry.title}
                                        </p>
                                        {entry.content && (
                                          <p className="text-xs text-slate-500">
                                            {entry.content.slice(0, 120)}
                                            {entry.content.length > 120
                                              ? "..."
                                              : ""}
                                          </p>
                                        )}
                                      </td>
                                      <td className="py-3 pr-3">
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                          {entry.type}
                                        </span>
                                      </td>
                                      <td className="py-3 pr-3 text-xs text-slate-500">
                                        {entry.tags.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {entry.tags.map((tag) => (
                                              <span
                                                key={`${entry.id}-${tag}`}
                                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                      <td className="py-3 pr-3 text-xs text-slate-500">
                                        {new Date(
                                          entry.updated_at,
                                        ).toLocaleString()}
                                      </td>
                                      <td className="py-3 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                          {entry.file_url &&
                                            effectiveWorkspaceId && (
                                              <a
                                                href={knowledgeEntryDownloadUrl(
                                                  effectiveWorkspaceId,
                                                  entry.id,
                                                  userId ?? undefined,
                                                )}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                                              >
                                                Download
                                              </a>
                                            )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {knowledgeTab === "comments" && (
                        <ProjectComments
                          comments={comments}
                          isLoading={loadingComments}
                          onCreate={handleCreateComment}
                          onUpdate={handleUpdateComment}
                          onDelete={handleDeleteComment}
                        />
                      )}

                      {knowledgeTab === "links" && (
                        <ProjectLinks
                          links={links}
                          isLoading={loadingLinks}
                          onCreate={handleCreateLink}
                          onDelete={handleDeleteLink}
                        />
                      )}

                      {knowledgeTab === "insights" && (
                        <section className="space-y-6">
                          <div className="grid gap-4 md:grid-cols-5">
                            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Documents
                              </p>
                              <p className="mt-3 text-3xl font-bold text-slate-900">
                                {knowledgeSummary.totalDocuments}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {knowledgeSummary.totalDocumentChunks} chunk
                                {knowledgeSummary.totalDocumentChunks === 1
                                  ? ""
                                  : "s"}{" "}
                                indexed
                              </p>
                              <p className="mt-2 text-xs text-slate-400">
                                {knowledgeSummary.latestDocumentUploadedAt
                                  ? `Last upload ${knowledgeSummary.latestDocumentUploadedAt}`
                                  : "No uploads yet"}
                              </p>
                            </div>
                            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Conversations
                              </p>
                              <p className="mt-3 text-3xl font-bold text-slate-900">
                                {knowledgeSummary.totalComments}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Insight
                                {knowledgeSummary.totalComments === 1
                                  ? ""
                                  : "s"}{" "}
                                captured across the project
                              </p>
                              {knowledgeSummary.latestComment && (
                                <p
                                  className="mt-2 overflow-hidden text-ellipsis text-xs italic text-slate-500"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  “{knowledgeSummary.latestComment.content}”
                                </p>
                              )}
                            </div>
                            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Prototypes
                              </p>
                              <p className="mt-3 text-3xl font-bold text-slate-900">
                                {knowledgeSummary.totalPrototypes ?? 0}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Clickable concepts generated from your roadmap
                              </p>
                              {knowledgeSummary.latestPrototype ? (
                                <p className="mt-2 text-xs text-slate-400">
                                  Latest{" "}
                                  {new Date(
                                    knowledgeSummary.latestPrototype.created_at,
                                  ).toLocaleString()}
                                </p>
                              ) : (
                                <p className="mt-2 text-xs text-slate-400">
                                  Generate a prototype to see it here.
                                </p>
                              )}
                            </div>
                            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Links
                              </p>
                              <p className="mt-3 text-3xl font-bold text-slate-900">
                                {knowledgeSummary.totalLinks ?? 0}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                References snapped to this project
                              </p>
                              {knowledgeSummary.latestLink ? (
                                <div className="mt-2 text-xs text-slate-400">
                                  <p className="text-slate-500 text-sm">
                                    {knowledgeSummary.latestLink.label}
                                  </p>
                                  <p>
                                    Latest{" "}
                                    {new Date(
                                      knowledgeSummary.latestLink.created_at,
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-slate-400">
                                  Add a link to see it here.
                                </p>
                              )}
                            </div>
                            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Product Snapshot
                              </p>
                              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                <li>
                                  <span className="font-semibold text-slate-700">
                                    North Star:
                                  </span>{" "}
                                  {projectInfo?.north_star_metric ||
                                    "Not specified"}
                                </li>
                                <li>
                                  <span className="font-semibold text-slate-700">
                                    Personas:
                                  </span>{" "}
                                  {projectInfo?.target_personas &&
                                  projectInfo.target_personas.length > 0
                                    ? projectInfo.target_personas.join(", ")
                                    : "Not specified"}
                                </li>
                                <li>
                                  <span className="font-semibold text-slate-700">
                                    Goals:
                                  </span>{" "}
                                  {projectInfo?.goals || "Not documented"}
                                </li>
                              </ul>
                            </div>
                          </div>

                          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-800">
                              Latest Comment Detail
                            </h3>
                            {knowledgeSummary.latestComment ? (
                              <div className="mt-3 space-y-2 text-sm text-slate-600">
                                <p>{knowledgeSummary.latestComment.content}</p>
                                {knowledgeSummary.latestComment.tags &&
                                  knowledgeSummary.latestComment.tags.length >
                                    0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {knowledgeSummary.latestComment.tags.map(
                                        (tag) => (
                                          <span
                                            key={tag}
                                            className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600"
                                          >
                                            {tag}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  )}
                                <p className="text-xs text-slate-400">
                                  {new Date(
                                    knowledgeSummary.latestComment.created_at,
                                  ).toLocaleString()}
                                  {knowledgeSummary.latestComment.author_id
                                    ? " · Saved by teammate"
                                    : ""}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">
                                Capture a comment to generate shared context for
                                the team.
                              </p>
                            )}
                          </div>
                          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-800">
                              Latest Prototype Snapshot
                            </h3>
                            {knowledgeSummary.latestPrototype ? (
                              <div className="mt-3 space-y-3 text-sm text-slate-600">
                                <div>
                                  <p className="text-base font-semibold text-slate-800">
                                    {knowledgeSummary.latestPrototype.title}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {new Date(
                                      knowledgeSummary.latestPrototype
                                        .created_at,
                                    ).toLocaleString()}
                                    {knowledgeSummary.latestPrototype.phase
                                      ? ` · ${knowledgeSummary.latestPrototype.phase}`
                                      : ""}
                                  </p>
                                </div>
                                <p>
                                  {knowledgeSummary.latestPrototype.summary}
                                </p>
                                {knowledgeSummary.latestPrototype.spec?.key_screens
                                  ?.slice(0, 2)
                                  .map((screen) => (
                                    <div
                                      key={`${knowledgeSummary.latestPrototype?.id}-${screen.name}`}
                                      className="rounded-2xl bg-slate-100 p-3"
                                    >
                                      <p className="text-sm font-semibold text-slate-800">
                                        {screen.name}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {screen.goal}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-500">
                                Generate a prototype to start visualizing your
                                roadmap phases.
                              </p>
                            )}
                          </div>
                        </section>
                      )}
                    </section>
                  )}

                  {activeTab === "roadmap" && (
                    <section className="space-y-6">
                      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className={SECTION_LABEL}>Roadmap control</p>
                            <h2 className="text-2xl font-semibold text-slate-900">
                              AI planning workspace
                            </h2>
                            <p className={BODY_SUBTLE}>
                              Define phases, link resources, and keep copilots
                              in sync without leaving this view.
                            </p>
                          </div>
                          <button
                            onClick={() => setActiveTab("assistant")}
                            className={`${PRIMARY_BUTTON} flex items-center gap-2`}
                          >
                            <AgentAvatar size="xs" className="shadow-none" />
                            <span>Chat with {agentName}</span>
                          </button>
                        </div>
                      </div>
                      <RoadmapPhaseView
                        projectId={projectId}
                        workspaceId={effectiveWorkspaceId}
                        userId={userId}
                        canEdit={canEditProject}
                        refreshKey={roadmapRefreshKey}
                        onChanged={handleRoadmapRefresh}
                      />
                      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                              Narrative
                            </p>
                            <h3 className="text-xl font-semibold text-slate-900">
                              Roadmap brief
                            </h3>
                            <p className="text-sm text-slate-500">
                              Capture the “why” behind the plan — autosaved
                              versions keep decision context handy.
                            </p>
                          </div>
                          {roadmapPreview && !isEditingRoadmap && (
                            <div className="text-right text-xs text-slate-500">
                              <p>
                                Last updated{" "}
                                {new Date(
                                  roadmapPreview.updated_at,
                                ).toLocaleString()}
                              </p>
                              {canEditProject ? (
                                <button
                                  onClick={handleStartEditingRoadmap}
                                  className="mt-1 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                                >
                                  Update brief
                                </button>
                              ) : (
                                <span className="mt-1 block font-semibold text-slate-400">
                                  Read-only
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {isEditingRoadmap ? (
                          <form
                            onSubmit={handleSaveRoadmap}
                            className="mt-4 space-y-3"
                          >
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={12}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                            <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
                              <button
                                type="button"
                                onClick={handleCancelEditingRoadmap}
                                className="rounded-full bg-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-300"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={savingRoadmap}
                                className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                              >
                                {savingRoadmap ? "Saving..." : "Save brief"}
                              </button>
                            </div>
                            {saveMessage && (
                              <p className="text-xs text-slate-500">
                                {saveMessage}
                              </p>
                            )}
                          </form>
                        ) : roadmapPreview ? (
                          <div className="mt-6 space-y-4 text-sm text-slate-700">
                            {roadmapBriefIsHtml ? (
                              <div
                                className="prose max-w-none text-slate-800 prose-headings:text-slate-900"
                                dangerouslySetInnerHTML={{ __html: roadmapBriefContent }}
                              />
                            ) : (
                              <SafeMarkdown>{roadmapBriefContent}</SafeMarkdown>
                            )}
                          </div>
                        ) : (
                          <p className="mt-6 text-sm text-slate-500">
                            No roadmap brief saved yet. Start a conversation
                            with {agentName} or capture your own POV.
                          </p>
                        )}
                      </div>
                    </section>
                  )}

                  {activeTab === "assistant" && (
                    <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="rounded-3xl border border-slate-100 bg-white/90 px-4 py-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.4)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-400">
                              Atlas history
                            </p>
                            <h3 className="text-lg font-semibold text-slate-900">{agentName} sessions</h3>
                            <p className="text-xs text-slate-500">
                              Draft strategies or PRDs, then revisit past chats for context.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleStartNewConversation}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              New chat
                            </button>
                            <button
                              type="button"
                              onClick={refreshChatSessions}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Refresh
                            </button>
                          </div>
                        </div>
                        {chatSessionsError && (
                          <p className="mt-3 text-sm text-rose-500">{chatSessionsError}</p>
                        )}
                        <div className="mt-4 space-y-2">
                          {chatSessionsLoading ? (
                            <p className="text-sm text-slate-500">Loading conversations…</p>
                          ) : chatSessions.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                              Start a conversation to capture the AI assistant’s guidance for this project.
                            </div>
                          ) : (
                            <ul className="space-y-2">
                              {chatSessions.map((session) => {
                                const isActive = session.id === roadmapChatId;
                                return (
                                  <li key={session.id}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectChatSession(session)}
                                      className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                        isActive
                                          ? "border-blue-600 bg-blue-600 text-white shadow-lg"
                                          : "border-slate-200 bg-white hover:border-slate-300"
                                      }`}
                                    >
                                      <p className="font-semibold">
                                        {new Date(session.created_at).toLocaleString()}
                                      </p>
                                      <p className="text-xs opacity-80">
                                        {session.messages.length} message{session.messages.length === 1 ? "" : "s"}
                                      </p>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                        <div className="rounded-3xl border border-slate-100 bg-white/95 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.6)]">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
                          <div>
                            <p className={SECTION_LABEL}>AI Copilot</p>
                            <h3 className="text-2xl font-semibold text-slate-900">
                              Chat with {agentName}
                            </h3>
                            <p className={BODY_SUBTLE}>
                              Ask questions about “{projectInfo?.title ?? "this project"}” and capture the responses.
                            </p>
                            {!canEditProject && (
                              <p className="mt-1 text-xs text-amber-600">
                                You have read-only access; prompts are disabled.
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setRoadmapTemplateModalOpen(true)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              {roadmapTemplate ? `Template: ${roadmapTemplate.title}` : "Choose template"}
                            </button>
                          </div>
                        </div>
                        <div className="flex h-full flex-col gap-4 border-t border-slate-100 bg-slate-50/90 px-6 py-4">
                          <div className={`flex items-center justify-between rounded-full border px-4 py-2 text-sm ${chatExpanded ? "border-slate-400 bg-white" : "border-slate-200 bg-white/70"}`}>
                            <span className="text-slate-600">{chatExpanded ? "Expanded view" : "Standard view"}</span>
                            <button
                              type="button"
                              onClick={() => setChatExpanded((prev) => !prev)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              {chatExpanded ? "Collapse" : "Expand"}
                            </button>
                          </div>
                          <div className={`rounded-3xl border border-slate-100 bg-white ${chatExpanded ? "h-[70vh]" : "min-h-[360px]"}`}>
                            <div className="flex h-full flex-col">
                              <div className="flex-1 overflow-y-auto">
                                <ChatWindow messages={chatMessages} isAssistantTyping={chatLoading} />
                              </div>
                              <div className="sticky bottom-0 bg-white/95 px-4 pb-4 pt-3">
                                <ChatInput
                                  onSend={handleRoadmapChatSend}
                                  disabled={!canEditProject || chatLoading}
                                  suggestions={chatSuggestions.length > 0 ? chatSuggestions : ROADMAP_CHAT_PROMPTS}
                                  placeholder={
                                    canEditProject
                                      ? "Describe what you’d like help with..."
                                      : "Viewer access cannot submit prompts."
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          {chatError && <p className="text-sm text-rose-500">{chatError}</p>}
                          <RoadmapPreviewCard
                            content={chatRoadmapContent}
                            onViewFull={roadmapPreview ? () => setActiveTab("roadmap") : undefined}
                          />
                          <ContextUsedPanel entries={chatContextEntries} />
                          <VerificationNotice verification={chatVerification} />
                        </div>
                      </div>
                    </section>
                  )}

                  {activeTab === "prototypes" && (
                    <section className="space-y-6">
                      <ProjectPrototypeAgent
                        session={prototypeSession}
                        loading={loadingPrototypeSession || loadingPrototypes}
                        sending={sendingPrototypeMessage}
                        error={prototypeSessionError}
                        onStart={handleStartPrototypeSession}
                        onSend={handleSendPrototypeMessage}
                      />
                      <ProjectPrototypes
                        prototypes={prototypes}
                        loading={loadingPrototypes}
                        onGenerate={handleGeneratePrototype}
                        generating={generatingPrototype}
                        onDelete={handleDeletePrototype}
                        onDeleteAll={handleDeleteAllPrototypes}
                        deletingAll={deletingAllPrototypes}
                      />
                    </section>
                  )}

                  {activeTab === "tasks" && (
                    <section className="space-y-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h2 className="text-2xl font-semibold text-slate-900">
                            Project Tasks & Kanban
                          </h2>
                          <p className="text-sm text-slate-500">
                            Organize work tied to this project. Tasks stay
                            synced with workspace RBAC.
                          </p>
                          {tasksError && (
                            <p className="mt-2 text-sm text-rose-600">
                              {tasksError}
                            </p>
                          )}
                          {!canManageTasks && (
                            <p className="mt-2 text-xs text-amber-600">
                              Viewer access — drag and edit actions are
                              disabled.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={loadTasks}
                            disabled={tasksLoading}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                          >
                            {tasksLoading ? "Refreshing…" : "Refresh"}
                          </button>
                          {canManageTasks && (
                            <>
                              <button
                                type="button"
                                onClick={() => setGenerateTasksOpen(true)}
                                disabled={generatingTasks}
                                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
                              >
                                {generatingTasks
                                  ? "Gathering context…"
                                  : "Generate via AI"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTask(null);
                                  setTaskFormOpen(true);
                                }}
                                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                              >
                                Add task
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-3xl border border-slate-100 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            Total
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {taskSummary.total}
                          </p>
                        </div>
                        <div className="rounded-3xl border border-slate-100 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            To Do
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {taskSummary.todo}
                          </p>
                        </div>
                        <div className="rounded-3xl border border-slate-100 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            In Progress
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {taskSummary.in_progress}
                          </p>
                        </div>
                        <div className="rounded-3xl border border-slate-100 bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                            Done
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">
                            {taskSummary.done}
                          </p>
                        </div>
                      </div>
                      {tasksLoading ? (
                        <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm text-slate-500">
                          Loading workspace tasks…
                        </div>
                      ) : tasks.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                          No tasks yet.{" "}
                          {canManageTasks
                            ? "Use “Add task” or ask the AI to generate a plan."
                            : "Ask an editor to create tasks for this project."}
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-slate-100 bg-white p-4">
                          <KanbanBoard
                            tasks={tasks}
                            onMoveTask={handleTaskMove}
                            onSelectTask={handleSelectTask}
                            canDrag={canManageTasks}
                          />
                        </div>
                      )}
                    </section>
                  )}

                  {activeTab === "prd" && (
                    <section>
                      {!selectedPrd ? (
                        <PRDList
                          projectId={projectId}
                          workspaceId={effectiveWorkspaceId}
                          projectRole={projectRole}
                          onSelectPrd={(projId, id) =>
                            setSelectedPrd({ projectId: projId, prdId: id })
                          }
                          onBack={() => {
                            setActiveTab("knowledge");
                            setKnowledgeTab("documents");
                          }}
                        />
                      ) : (
                        <PRDDetail
                          projectId={selectedPrd.projectId}
                          prdId={selectedPrd.prdId}
                          workspaceId={effectiveWorkspaceId}
                          projectRole={projectRole}
                          initialSidePanel={
                            selectedPrd.prdId === initialFocusedPrdId &&
                            initialFocusSection === "decision"
                              ? "history"
                              : undefined
                          }
                          focusSection={
                            selectedPrd.prdId === initialFocusedPrdId
                              ? (initialFocusSection ?? undefined)
                              : undefined
                          }
                          onBack={() => setSelectedPrd(null)}
                        />
                      )}
                    </section>
                  )}

                  {activeTab === "agents" && (
                    <section className="space-y-6">
                      <div className="rounded-3xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                              Assigned agents
                            </p>
                            {projectAgents.length === 0 ? (
                              <p className="text-sm text-slate-500">
                                No agents assigned to this project yet.
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                {projectAgents.map((agent) => (
                                  <span
                                    key={agent.id}
                                    className="rounded-full bg-slate-100 px-3 py-1"
                                  >
                                    {agent.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setAssignAgentsOpen(true)}
                              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Assign agents
                            </button>
                            {effectiveWorkspaceId && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/workspaces/${effectiveWorkspaceId}/agents`,
                                  )
                                }
                                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                              >
                                Open builder
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {activeTab === "members" && (
                    <div>
                      <ProjectMembersPanel
                        projectId={projectId}
                        workspaceId={effectiveWorkspaceId}
                        userId={userId}
                        projectRole={projectRole}
                        workspaceRole={workspaceRole}
                      />
                    </div>
                  )}
                  {activeTab === "strategy" && effectiveWorkspaceId && (
                    <div>
                      <ProjectStrategistPanel
                        workspaceId={effectiveWorkspaceId}
                        projectId={projectId}
                        userId={userId}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <TaskForm
        open={taskFormOpen}
        onClose={closeTaskForm}
        onSubmit={handleSubmitTask}
        initialTask={editingTask}
      />
      <TaskDetailDrawer
        task={selectedTask}
        comments={taskComments}
        open={taskDrawerOpen}
        onClose={handleCloseTaskDrawer}
        onAddComment={handleAddTaskComment}
        loading={taskCommentsLoading}
        canEdit={canManageTasks}
        onEdit={handleEditTask}
        onDelete={handleDeleteTask}
        deleting={taskDeleting}
      />
      <GenerateTasksModal
        open={generateTasksOpen}
        onClose={() => setGenerateTasksOpen(false)}
        onGenerate={handleGenerateTasksRequest}
        onConfirm={async (items) => {
          await handleInsertGeneratedTasks(items);
          setGenerateTasksOpen(false);
        }}
      />
      <TemplatePickerModal
        open={roadmapTemplateModalOpen}
        workspaceId={effectiveWorkspaceId}
        onClose={() => setRoadmapTemplateModalOpen(false)}
        onSelect={(template) => setRoadmapTemplate(template)}
      />
      {isEditingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Edit project
              </h2>
              <button
                onClick={() => setIsEditingProject(false)}
                className="text-slate-400 transition hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!canEditProject) {
                  setProjectSaveMessage(
                    "You have read-only access to this workspace.",
                  );
                  return;
                }
                if (!effectiveWorkspaceId) {
                  setProjectSaveMessage("Workspace context missing");
                  return;
                }
                if (!projectInfo) return;

                setProjectSaving(true);
                setProjectSaveMessage(null);
                const personasArray = projectForm.target_personas
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);

                try {
                  const updated = await updateProject(projectId, {
                    title: projectForm.title.trim(),
                    description: projectForm.description.trim(),
                    goals: projectForm.goals.trim(),
                    north_star_metric:
                      projectForm.north_star_metric.trim() || null,
                    target_personas: personasArray,
                    workspace_id: effectiveWorkspaceId,
                    website_url: projectForm.website_url.trim() || null,
                  });
                  setProjectInfo({
                    title: updated.project.title,
                    description: updated.project.description,
                    goals: updated.project.goals,
                    north_star_metric: updated.project.north_star_metric,
                    target_personas: updated.project.target_personas,
                    website_url: updated.project.website_url,
                  });
                  onProjectUpdated({
                    id: projectId,
                    title: updated.project.title,
                    description: updated.project.description,
                    goals: updated.project.goals,
                    north_star_metric: updated.project.north_star_metric,
                    target_personas: updated.project.target_personas,
                    website_url: updated.project.website_url,
                  });
                  setProjectSaveMessage("Project updated successfully.");
                  setIsEditingProject(false);
                } catch (err: any) {
                  console.error("Failed to update project", err);
                  setProjectSaveMessage(
                    err.message || "Failed to update project",
                  );
                } finally {
                  setProjectSaving(false);
                }
              }}
            >
              <label className="block text-sm font-medium text-slate-600">
                Title
                <input
                  value={projectForm.title}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Description
                <textarea
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Product website or URL
                <input
                  value={projectForm.website_url}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      website_url: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="https://example.com"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  We pull positioning cues from this page so every PRD, roadmap,
                  and insight starts with the right context.
                </span>
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Goals
                <textarea
                  value={projectForm.goals}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      goals: event.target.value,
                    }))
                  }
                  className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                North Star Metric
                <input
                  value={projectForm.north_star_metric}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      north_star_metric: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Target Personas
                <input
                  value={projectForm.target_personas}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      target_personas: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Comma-separated (e.g. Product Managers, Designers)"
                />
              </label>
              {projectSaveMessage && (
                <p className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
                  {projectSaveMessage}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProject(false)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={projectSaving}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {projectSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {infoDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="relative w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Project summary
              </h2>
              <button
                onClick={() => setInfoDrawerOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="space-y-5">
              {projectOverviewCard}
              {pulseCard}
            </div>
          </div>
        </div>
      )}
      {showEntryModal && effectiveWorkspaceId && (
        <UploadEntryModal
          open={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          onCreateText={handleCreateProjectEntry}
          onUploadFile={handleUploadProjectEntry}
          defaultProjectId={projectId}
          projectIdLocked
          projectOptions={[
            { id: projectId, label: projectInfo?.title || "This project" },
          ]}
        />
      )}
      {assignAgentsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Assign workspace agents
              </h2>
              <button
                onClick={() => setAssignAgentsOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {availableAgents.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No agents yet. Use the builder to create one.
                </p>
              ) : (
                availableAgents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgentIds.includes(agent.id)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedAgentIds((prev) => [...prev, agent.id]);
                        } else {
                          setSelectedAgentIds((prev) =>
                            prev.filter((id) => id !== agent.id),
                          );
                        }
                      }}
                    />
                    <div>
                      <p className="font-semibold">{agent.name}</p>
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {agent.description}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignAgentsOpen(false)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignAgentsSubmit}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
