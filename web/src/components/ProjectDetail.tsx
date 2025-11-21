import React, { useCallback, useEffect, useMemo, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import PRDList from "./PRDList";
import PRDDetail from "./PRDDetail";
import ProjectComments from "./ProjectComments";
import ProjectLinks from "./ProjectLinks";
import ProjectPrototypes from "./ProjectPrototypes";
import ProjectPrototypeAgent from "./ProjectPrototypeAgent";
import ProjectMembersPanel from "./ProjectMembersPanel";
import UploadEntryModal from "./UploadEntryModal";
import {
  getProject,
  fetchRoadmap as fetchSavedRoadmap,
  generateRoadmapChat,
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
  type ChatMessage,
  type ProjectComment,
  type ProjectRole,
  type ProjectLink,
  type PrototypeSession,
  type Prototype,
  type WorkspaceRole,
  type KnowledgeBaseContextItem,
  type KnowledgeBaseEntry,
  type KnowledgeBaseEntryType,
  type KnowledgeBaseEntryPayload,
  type KnowledgeSearchResult,
  listKnowledgeBaseEntries,
  createKnowledgeBaseEntry,
  uploadKnowledgeBaseEntry,
  searchKnowledgeBase,
  knowledgeEntryDownloadUrl,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY } from "../constants";
import { useUserRole } from "../context/RoleContext";

const makeId = () => Math.random().toString(36).slice(2, 10);

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
  }) => void;
  onBack: () => void;
  onOpenKnowledgeBase?: () => void;
};

type ConversationEntry = ChatMessage & { id: string };

type RoadmapPreview = {
  content: string;
  updated_at: string;
};

export default function ProjectDetail({
  projectId,
  workspaceId,
  workspaceRole,
  onProjectUpdated,
  onBack,
  onOpenKnowledgeBase,
}: ProjectDetailProps) {
  const { projectRoles, refreshProjectRole } = useUserRole();
  const userId = useMemo(() => {
    if (typeof window === "undefined") {
      return (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined) ?? null;
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
  const canEditProject = projectRole === "owner" || projectRole === "contributor";
  const canManageProjectMembers = projectRole === "owner" || workspaceRole === "admin";
  const canEditKnowledgeBase = workspaceRole === "admin" || workspaceRole === "editor";

  const [projectInfo, setProjectInfo] = useState<{
    title: string;
    description: string;
    goals: string;
    north_star_metric?: string | null;
    target_personas?: string[] | null;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"knowledge" | "roadmap" | "prototypes" | "prd" | "members">(
    "knowledge"
  );
  const [knowledgeTab, setKnowledgeTab] = useState<
    "documents" | "comments" | "links" | "insights"
  >("documents");
  const [projectEntries, setProjectEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [projectEntriesLoading, setProjectEntriesLoading] = useState(false);
  const [projectEntriesError, setProjectEntriesError] = useState<string | null>(null);
  const [projectEntryType, setProjectEntryType] = useState<KnowledgeBaseEntryType | "all">("all");
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
    []
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
  const [prototypeSession, setPrototypeSession] = useState<PrototypeSession | null>(null);
  const [loadingPrototypeSession, setLoadingPrototypeSession] = useState(false);
  const [prototypeSessionError, setPrototypeSessionError] = useState<string | null>(null);
  const [sendingPrototypeMessage, setSendingPrototypeMessage] = useState(false);

  // Roadmap interaction state
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [promptInput, setPromptInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [roadmapContext, setRoadmapContext] = useState<KnowledgeBaseContextItem[]>([]);

  const [roadmapPreview, setRoadmapPreview] = useState<RoadmapPreview | null>(null);
  const [isEditingRoadmap, setIsEditingRoadmap] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingRoadmap, setSavingRoadmap] = useState(false);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectSaveMessage, setProjectSaveMessage] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    title: "",
    description: "",
    goals: "",
    north_star_metric: "",
    target_personas: "",
  });

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

  const resetConversation = () => {
    setConversation([]);
    setPromptInput("");
    setGenerateError(null);
    setSuggestions([]);
  };

  useEffect(() => {
    if (!projectInfo) return;
    setProjectForm({
      title: projectInfo.title,
      description: projectInfo.description,
      goals: projectInfo.goals,
      north_star_metric: projectInfo.north_star_metric || "",
      target_personas: (projectInfo.target_personas || []).join(", "),
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
          projectId
        );
        const normalized: KnowledgeBaseEntry[] = semanticResults.map((result: KnowledgeSearchResult) => ({
          id: result.id,
          kb_id: effectiveWorkspaceId,
          type: result.type,
          title: result.title || result.filename || "Untitled entry",
          content: result.content || "",
          file_url: null,
          source_url: null,
          created_by: null,
          project_id: result.project_id ?? projectId ?? null,
          tags: [],
          created_at: result.uploaded_at,
          updated_at: result.uploaded_at,
        }));
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
        const list = await listKnowledgeBaseEntries(effectiveWorkspaceId, filters, userId ?? undefined);
        setProjectEntries(list);
        setProjectEntriesSemantic(false);
      }
    } catch (err: any) {
      setProjectEntriesError(err.message || "Failed to load project knowledge entries.");
    } finally {
      setProjectEntriesLoading(false);
    }
  }, [effectiveWorkspaceId, projectEntryType, projectEntrySearch, projectId, userId]);

  useEffect(() => {
    if (knowledgeTab !== "documents") return;
    loadProjectEntries();
  }, [knowledgeTab, loadProjectEntries]);

  const handleCreateProjectEntry = async (payload: KnowledgeBaseEntryPayload) => {
    if (!effectiveWorkspaceId) return;
    const finalPayload = {
      ...payload,
      project_id: payload.project_id ?? projectId,
    };
    await createKnowledgeBaseEntry(effectiveWorkspaceId, finalPayload, userId ?? undefined);
    await loadProjectEntries();
  };

  const handleUploadProjectEntry = async (
    file: File,
    payload: { type: KnowledgeBaseEntryType; title?: string; tags?: string[]; project_id?: string | null }
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
    await uploadKnowledgeBaseEntry(effectiveWorkspaceId, formData, userId ?? undefined);
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

  const handleUpdateComment = async (id: string, content: string, tags: string[]) => {
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

  const handleGeneratePrototype = async ({ phase, focus, count }: { phase: string; focus: string; count: number }) => {
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
        await generatePrototypeBatch(projectId, effectiveWorkspaceId, requestPayload);
      } else {
        await generatePrototype(projectId, effectiveWorkspaceId, requestPayload);
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
      const sessions = await getPrototypeSessions(projectId, effectiveWorkspaceId);
      setPrototypeSession(sessions.length > 0 ? sessions[0] : null);
    } catch (err) {
      console.error("Failed to fetch prototype sessions", err);
      setPrototypeSessionError(err instanceof Error ? err.message : "Unable to load prototype sessions");
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
      const session = await createPrototypeSession(projectId, effectiveWorkspaceId, prompt);
      setPrototypeSession(session);
      await loadPrototypes();
    } catch (err) {
      console.error("Failed to start prototype session", err);
      setPrototypeSessionError(err instanceof Error ? err.message : "Unable to start prototype session");
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
        message
      );
      setPrototypeSession(updated);
      await loadPrototypes();
    } catch (err) {
      console.error("Failed to send prototype agent message", err);
      setPrototypeSessionError(err instanceof Error ? err.message : "Unable to send agent message");
      throw err;
    } finally {
      setSendingPrototypeMessage(false);
    }
  };

  const knowledgeSummary = useMemo(() => {
    const latestComment = comments.length > 0 ? comments[0] : null;
    const latestLink = links.length > 0 ? links[0] : null;
    const latestPrototype = prototypes.length > 0 ? prototypes[0] : null;
    const documentEntries = projectEntries.filter((entry) =>
      ["document", "repo", "research"].includes(entry.type)
    );
    const latestDocument = documentEntries.length > 0 ? documentEntries[0] : null;

    return {
      totalDocuments: documentEntries.length,
      totalDocumentChunks: documentEntries.length,
      latestDocumentUploadedAt: latestDocument ? new Date(latestDocument.updated_at).toLocaleString() : null,
      totalComments: comments.length,
      latestComment,
      totalLinks: links.length,
      latestLink,
      totalPrototypes: prototypes.length,
      latestPrototype,
    };
  }, [comments, links, prototypes, projectEntries]);

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

  const handleGenerateRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProject) {
      setGenerateError("You have read-only access to this workspace.");
      return;
    }
    const prompt = promptInput.trim();
    if (!prompt) {
      setGenerateError(
        conversation.length === 0
          ? "Describe what you need from the roadmap."
          : "Please provide a reply before continuing."
      );
      return;
    }

    if (!effectiveWorkspaceId) {
      setGenerateError("Workspace missing. Return to projects and re-open.");
      return;
    }

    const userMessage: ConversationEntry = {
      id: makeId(),
      role: "user",
      content: prompt,
    };
    setConversation((prev) => [...prev, userMessage]);
    setPromptInput("");
    setSuggestions([]);
    setIsGenerating(true);
    setIsAssistantTyping(true);
    setGenerateError(null);

    const historyPayload: ChatMessage[] = [...conversation, userMessage].map(
      ({ role, content }) => ({ role, content })
    );

    try {
      if (!effectiveWorkspaceId) {
        throw new Error("Workspace context missing");
      }
      const response = await generateRoadmapChat(
        projectId,
        "",
        historyPayload,
        userId ?? undefined,
        effectiveWorkspaceId
      );
      setRoadmapContext(response.context_entries ?? []);

      const mapped = response.conversation_history.map<ConversationEntry>((msg) => ({
        ...msg,
        id: makeId(),
      }));

      const assistantEntry = mapped[mapped.length - 1];
      const prior = mapped.slice(0, -1);
      setConversation(prior);

      const animateAssistantMessage = (entry: ConversationEntry) => {
        const full = entry.content;
        const tempId = entry.id;
        setConversation((prev) => [...prev, { ...entry, content: "" }]);

        let index = 0;
        const step = Math.max(1, Math.ceil(full.length / 40));
        const timer = window.setInterval(() => {
          index += step;
          const nextSlice = full.slice(0, Math.min(index, full.length));
          setConversation((prev) =>
            prev.map((msg) =>
              msg.id === tempId ? { ...msg, content: nextSlice } : msg
            )
          );
          if (index >= full.length) {
            clearInterval(timer);
            setIsAssistantTyping(false);
            setConversation((prev) =>
              prev.map((msg) => (msg.id === tempId ? entry : msg))
            );
          }
        }, 20);
      };

      if (assistantEntry) {
        animateAssistantMessage(assistantEntry);
      } else {
        setIsAssistantTyping(false);
      }

      if (response.roadmap) {
        await loadRoadmap();
      }

      if (response.action === "ask_followup") {
        setSuggestions(response.suggestions ?? []);
      } else {
        setSuggestions([]);
      }
    } catch (err: any) {
      console.error(err);
      setGenerateError(err.message || "Failed to generate roadmap.");
      setIsAssistantTyping(false);
      setSuggestions([]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartNewConversation = () => {
    resetConversation();
  };

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
        });
      } catch (err) {
        console.error("Failed to load project info", err);
      }
    };

    fetchProjectInfo();
  }, [projectId, effectiveWorkspaceId]);

  useEffect(() => {
    fetchDocuments();
    loadComments();
    loadLinks();
    loadRoadmap();
    loadPrototypes();
  }, [projectId, effectiveWorkspaceId]);

  useEffect(() => {
    if (activeTab === "prototypes") {
      loadPrototypeSessions();
    }
  }, [activeTab, projectId, effectiveWorkspaceId]);

  // ------------------- Render -------------------
  if (!effectiveWorkspaceId) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-500">
          Workspace context missing. Please return to the dashboard and select a workspace.
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          onClick={onBack}
          className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          ⬅ Back to Projects
        </button>

        {projectInfo && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-bold text-slate-900">{projectInfo.title}</h1>
            <p className="mt-3 text-slate-600">{projectInfo.description}</p>
            <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-700">Goals</p>
                <p className="mt-1 leading-relaxed">{projectInfo.goals}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">North Star Metric</p>
                <p className="mt-1">
                  {projectInfo.north_star_metric || "Not specified"}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="font-semibold text-slate-700">Target Personas</p>
                <p className="mt-1">
                  {projectInfo.target_personas && projectInfo.target_personas.length > 0
                    ? projectInfo.target_personas.join(", ")
                    : "Not specified"}
                </p>
              </div>
            </div>
            {canEditProject ? (
              <button
                onClick={() => {
                  setProjectSaveMessage(null);
                  setIsEditingProject(true);
                }}
                className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                Edit project details
              </button>
            ) : (
              <p className="mt-4 text-xs text-slate-500">
                You have viewer access and cannot edit project details.
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex gap-6 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-500">
          <button
            onClick={() => setActiveTab("knowledge")}
            className={
              activeTab === "knowledge"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Knowledge Base
          </button>
          <button
            onClick={() => setActiveTab("roadmap")}
            className={
              activeTab === "roadmap"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Roadmap
          </button>
          <button
            onClick={() => setActiveTab("prototypes")}
            className={
              activeTab === "prototypes"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Prototypes
          </button>
          <button
            onClick={() => setActiveTab("prd")}
            className={
              activeTab === "prd"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            PRDs
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={
              activeTab === "members"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Members
          </button>
        </div>

        {activeTab === "knowledge" && (
          <section className="mt-6 space-y-6">
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
                    <h2 className="text-xl font-semibold text-slate-900">Project Knowledge</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Entries tagged to this project from the workspace Knowledge Base.
                    </p>
                    {!canEditKnowledgeBase && (
                      <p className="mt-2 text-xs text-amber-600">
                        You have viewer access and cannot upload or edit entries.
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
                      onChange={(event) => setProjectEntrySearch(event.target.value)}
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

                {projectEntriesSemantic && projectEntrySearch.trim().length >= 3 && (
                  <p className="text-xs text-slate-500">
                    Showing semantic matches for “{projectEntrySearch.trim()}”.
                  </p>
                )}

                {projectEntriesError && (
                  <p className="mt-3 text-sm text-rose-600">{projectEntriesError}</p>
                )}

                {projectEntriesLoading ? (
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                    Loading project entries...
                  </div>
                ) : projectEntries.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    No knowledge base entries are tagged to this project yet.
                    {canEditKnowledgeBase && " Use the button above to add one."}
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
                          <tr key={entry.id} className="border-t border-slate-100 text-slate-600">
                            <td className="py-3 pr-3">
                              <p className="font-semibold text-slate-900">{entry.title}</p>
                              {entry.content && (
                                <p className="text-xs text-slate-500">
                                  {entry.content.slice(0, 120)}
                                  {entry.content.length > 120 ? "..." : ""}
                                </p>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {entry.type}
                              </span>
                            </td>
                            <td className="py-3 pr-3 text-xs text-slate-500">
                              {entry.tags.length > 0 ? entry.tags.join(", ") : "—"}
                            </td>
                            <td className="py-3 pr-3 text-xs text-slate-500">
                              {new Date(entry.updated_at).toLocaleString()}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                {entry.file_url && effectiveWorkspaceId && (
                                  <a
                                    href={knowledgeEntryDownloadUrl(effectiveWorkspaceId, entry.id, userId ?? undefined)}
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
                      {knowledgeSummary.totalDocumentChunks} chunk{knowledgeSummary.totalDocumentChunks === 1 ? "" : "s"} indexed
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
                      Insight{knowledgeSummary.totalComments === 1 ? "" : "s"} captured across the project
                    </p>
                      {knowledgeSummary.latestComment && (
                        <p
                          className="mt-2 overflow-hidden text-ellipsis text-xs italic text-slate-500"
                          style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
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
                        Latest {new Date(knowledgeSummary.latestPrototype.created_at).toLocaleString()}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">Generate a prototype to see it here.</p>
                    )}
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Links
                    </p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {knowledgeSummary.totalLinks ?? 0}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">References snapped to this project</p>
                    {knowledgeSummary.latestLink ? (
                      <div className="mt-2 text-xs text-slate-400">
                        <p className="text-slate-500 text-sm">{knowledgeSummary.latestLink.label}</p>
                        <p>Latest {new Date(knowledgeSummary.latestLink.created_at).toLocaleString()}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">Add a link to see it here.</p>
                    )}
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Product Snapshot
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>
                        <span className="font-semibold text-slate-700">North Star:</span>{" "}
                        {projectInfo?.north_star_metric || "Not specified"}
                      </li>
                      <li>
                        <span className="font-semibold text-slate-700">Personas:</span>{" "}
                        {projectInfo?.target_personas && projectInfo.target_personas.length > 0
                          ? projectInfo.target_personas.join(", ")
                          : "Not specified"}
                      </li>
                      <li>
                        <span className="font-semibold text-slate-700">Goals:</span>{" "}
                        {projectInfo?.goals || "Not documented"}
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-800">Latest Comment Detail</h3>
                  {knowledgeSummary.latestComment ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p>{knowledgeSummary.latestComment.content}</p>
                      {knowledgeSummary.latestComment.tags && knowledgeSummary.latestComment.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {knowledgeSummary.latestComment.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        {new Date(knowledgeSummary.latestComment.created_at).toLocaleString()}
                        {knowledgeSummary.latestComment.author_id ? " · Saved by teammate" : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      Capture a comment to generate shared context for the team.
                    </p>
                  )}
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-800">Latest Prototype Snapshot</h3>
                  {knowledgeSummary.latestPrototype ? (
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <p className="text-base font-semibold text-slate-800">
                          {knowledgeSummary.latestPrototype.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(knowledgeSummary.latestPrototype.created_at).toLocaleString()}
                          {knowledgeSummary.latestPrototype.phase ? ` · ${knowledgeSummary.latestPrototype.phase}` : ""}
                        </p>
                      </div>
                      <p>{knowledgeSummary.latestPrototype.summary}</p>
                      {knowledgeSummary.latestPrototype.spec?.key_screens?.slice(0, 2).map((screen) => (
                        <div key={`${knowledgeSummary.latestPrototype?.id}-${screen.name}`} className="rounded-2xl bg-slate-100 p-3">
                          <p className="text-sm font-semibold text-slate-800">{screen.name}</p>
                          <p className="text-xs text-slate-500">{screen.goal}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      Generate a prototype to start visualizing your roadmap phases.
                    </p>
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {activeTab === "roadmap" && (
          <section className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900">AI Roadmap</h2>
              <button
                onClick={() => {
                  if (canEditProject) setShowAssistant(true);
                }}
                disabled={!canEditProject}
                className={`rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  canEditProject ? "hover:bg-blue-700" : "cursor-not-allowed opacity-60"
                }`}
              >
                Open assistant
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              {roadmapPreview && !isEditingRoadmap && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Last updated {new Date(roadmapPreview.updated_at).toLocaleString()}
                  </span>
                  {canEditProject ? (
                    <button
                      onClick={handleStartEditingRoadmap}
                      className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      Update roadmap
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">Read-only view</span>
                  )}
                </div>
              )}

              {isEditingRoadmap ? (
                <form onSubmit={handleSaveRoadmap} className="mt-4 space-y-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={12}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="flex items-center justify-end gap-3 text-sm">
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
                      {savingRoadmap ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {saveMessage && (
                    <p className="text-xs text-slate-500">{saveMessage}</p>
                  )}
                </form>
              ) : roadmapPreview ? (
                <div className="mt-4 space-y-4 text-sm text-slate-700">
                  <SafeMarkdown>
                    {formatRoadmapForDisplay(
                      typeof roadmapPreview.content === "string"
                        ? roadmapPreview.content
                        : JSON.stringify(roadmapPreview.content ?? "", null, 2)
                    )}
                  </SafeMarkdown>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  No roadmap saved yet. Start a conversation with the assistant.
                </p>
              )}
            </div>
          </section>
        )}

        {activeTab === "prototypes" && (
          <section className="mt-6 space-y-6">
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

        {activeTab === "prd" && (
          <section className="mt-6">
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
                onBack={() => setSelectedPrd(null)}
              />
            )}
          </section>
        )}

        {activeTab === "members" && (
          <div className="mt-6">
            <ProjectMembersPanel
              projectId={projectId}
              workspaceId={effectiveWorkspaceId}
              userId={userId}
              projectRole={projectRole}
              workspaceRole={workspaceRole}
            />
          </div>
        )}
      </div>
      {showAssistant && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Roadmap assistant</h3>
                <p className="text-xs text-slate-500">
                  Share your intent, answer follow-ups, and refine the roadmap instantly.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAssistant(false);
                  setSuggestions([]);
                }}
                className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {!canEditProject && (
                <p className="text-xs text-slate-500">
                  You have viewer access. The assistant is available in read-only mode.
                </p>
              )}
              {conversation.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No messages yet. Provide a prompt to begin.
                </p>
              ) : (
                <ul className="space-y-3">
                  {conversation.map((msg) => (
                    <li
                      key={msg.id}
                      className={
                        msg.role === "user"
                          ? "ml-auto max-w-[85%] rounded-2xl bg-blue-600 px-4 py-2 text-sm text-white"
                          : "max-w-[90%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800"
                      }
                    >
                      <span className="block whitespace-pre-wrap">{msg.content}</span>
                    </li>
                  ))}
                </ul>
              )}
              {isAssistantTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
                    Assistant is typing…
                  </div>
                </div>
              )}
            </div>
            {roadmapContext.length > 0 && (
              <div className="border-t border-slate-200 px-6 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Context used
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {roadmapContext.map((entry) => (
                    <li key={entry.id}>
                      <span className="font-semibold text-slate-900">{entry.title}</span> · {entry.type}
                      <p className="text-xs text-slate-500">{entry.snippet}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {generateError && (
              <p className="px-6 text-sm text-rose-500">{generateError}</p>
            )}

            <form onSubmit={handleGenerateRoadmap} className="border-t border-slate-200 px-6 py-4 space-y-3">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={
                  conversation.length === 0
                    ? "Describe the initiative or strategic question you want the roadmap to cover"
                    : "Reply to the assistant..."
                }
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                disabled={isGenerating || !canEditProject}
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Conversation length: {conversation.length} message{conversation.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-2">
                  {conversation.length > 0 && !isGenerating && (
                    <button
                      type="button"
                      onClick={handleStartNewConversation}
                      disabled={!canEditProject}
                      className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300 disabled:opacity-60"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                    disabled={isGenerating || !canEditProject}
                  >
                    {isGenerating ? "Thinking..." : "Send"}
                  </button>
                </div>
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs">
                  {suggestions.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => canEditProject && setPromptInput(chip)}
                      disabled={!canEditProject}
                      className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-60"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {isEditingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit project</h2>
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
                  setProjectSaveMessage("You have read-only access to this workspace.");
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
                    north_star_metric: projectForm.north_star_metric.trim() || null,
                    target_personas: personasArray,
                    workspace_id: effectiveWorkspaceId,
                  });
                  setProjectInfo({
                    title: updated.project.title,
                    description: updated.project.description,
                    goals: updated.project.goals,
                    north_star_metric: updated.project.north_star_metric,
                    target_personas: updated.project.target_personas,
                  });
                  onProjectUpdated({
                    id: projectId,
                    title: updated.project.title,
                    description: updated.project.description,
                    goals: updated.project.goals,
                    north_star_metric: updated.project.north_star_metric,
                    target_personas: updated.project.target_personas,
                  });
                  setProjectSaveMessage("Project updated successfully.");
                  setIsEditingProject(false);
                } catch (err: any) {
                  console.error("Failed to update project", err);
                  setProjectSaveMessage(err.message || "Failed to update project");
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
                    setProjectForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Description
                <textarea
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Goals
                <textarea
                  value={projectForm.goals}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, goals: event.target.value }))
                  }
                  className="mt-2 h-24 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                North Star Metric
                <input
                  value={projectForm.north_star_metric}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, north_star_metric: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Target Personas
                <input
                  value={projectForm.target_personas}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, target_personas: event.target.value }))
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
      {showEntryModal && effectiveWorkspaceId && (
        <UploadEntryModal
          open={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          onCreateText={handleCreateProjectEntry}
          onUploadFile={handleUploadProjectEntry}
          defaultProjectId={projectId}
          projectIdLocked
          projectOptions={[{ id: projectId, label: projectInfo?.title || "This project" }]}
        />
      )}
    </div>
  );
}
