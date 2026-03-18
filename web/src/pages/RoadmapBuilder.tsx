import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  fetchRoadmap,
  getProject,
  getProjects,
  getWorkspacePrds,
  createKnowledgeBaseEntry,
  uploadKnowledgeBaseEntry,
  listKnowledgeBaseEntries,
  updateKnowledgeBaseEntry,
  linkRoadmapContext,
  knowledgeEntryDownloadUrl,
  sendRoadmapChatTurn,
  fetchWorkspaceRoadmap,
  sendWorkspaceRoadmapChatTurn,
  generateRoadmapChat,
  generateWorkspaceRoadmapChat,
  saveRoadmap,
  saveWorkspaceRoadmap,
  type ChatMessage,
  type KnowledgeBaseEntry,
  type RoadmapChatTurnResponse,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";
import SafeMarkdown from "../components/SafeMarkdown";
import TypingIndicator from "../components/TypingIndicator";
import { getStoredAgentName } from "../utils/agentProfile";

type RBIconName =
  | "back"
  | "header"
  | "send"
  | "preview"
  | "link"
  | "upload"
  | "note"
  | "empty"
  | "all"
  | "projects"
  | "prds"
  | "linked"
  | "add";

function RBIcon({ name, className }: { name: RBIconName; className?: string }) {
  const sizeClass = className || "h-4 w-4";
  switch (name) {
    case "back":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M12.5 4.5L7 10l5.5 5.5" stroke="#101828" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "header":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4" width="14" height="12" rx="2" stroke="#4f46e5" strokeWidth="1.7" />
          <path d="M3 8h14" stroke="#4f46e5" strokeWidth="1.7" />
        </svg>
      );
    case "send":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M3 10L17 3l-3 14-4.5-5L3 10Z" fill="white" />
        </svg>
      );
    case "preview":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="4" width="13" height="12" rx="2" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M6.5 12l2.5-2.5L11 11l2.5-2.5 2 2" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "link":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M7.8 12.2l-1.6 1.6a2.6 2.6 0 1 1-3.7-3.7l2.8-2.8a2.6 2.6 0 0 1 3.7 0" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12.2 7.8l1.6-1.6a2.6 2.6 0 1 1 3.7 3.7l-2.8 2.8a2.6 2.6 0 0 1-3.7 0" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7.5 12.5l5-5" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "upload":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M10 13V5.5M10 5.5L7.5 8M10 5.5L12.5 8" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 13.5v1.5h11v-1.5" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "note":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="4" y="3.5" width="12" height="13" rx="2" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M7 7h6M7 10h6M7 13h4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "empty":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="20" rx="4" stroke="#9ca3af" strokeWidth="2" />
          <path d="M10 12h12M10 17h9" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "all":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="6" cy="6" r="2" fill="currentColor" />
          <circle cx="14" cy="6" r="2" fill="currentColor" />
          <circle cx="6" cy="14" r="2" fill="currentColor" />
          <circle cx="14" cy="14" r="2" fill="currentColor" />
        </svg>
      );
    case "projects":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="4" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 8h13" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "prds":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2.5" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "linked":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M8 10h4" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7.5 7.5a2.5 2.5 0 0 0 0 5M12.5 7.5a2.5 2.5 0 0 1 0 5" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "add":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

const getIntroMessage = (botName: string) =>
  `Hi! I'm ${botName}. I can help you build your roadmap. Share the vision, target users, success metrics, timeline, and any constraints to get started.`;

const DEFAULT_SUGGESTIONS = [
  "Target users are...",
  "Success metrics include...",
  "We need MVP by...",
  "Key risks or constraints...",
];

const normalizeRoadmapMarkdown = (value: string): string => {
  const trimmed = (value || "").trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return trimmed;
};

const formatUpdatedAt = (iso?: string | null) => {
  if (!iso) return "Not updated yet";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

export default function RoadmapBuilder() {
  const navigate = useNavigate();
  const { workspaceId, projectId } = useParams<{ workspaceId?: string; projectId?: string }>();
  const botName = useMemo(() => getStoredAgentName(), []);
  const introMessage = useMemo(() => getIntroMessage(botName), [botName]);
  const [projectTitle, setProjectTitle] = useState<string>("Roadmap");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: introMessage },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [roadmapContent, setRoadmapContent] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSavingRoadmap, setIsSavingRoadmap] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [rightTab, setRightTab] = useState<"preview" | "context">("context");
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextTab, setContextTab] = useState<"all" | "projects" | "prds">("all");
  const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());
  const [contextProjects, setContextProjects] = useState<
    Array<{ id: string; title: string; description?: string | null }>
  >([]);
  const [contextPrds, setContextPrds] = useState<
    Array<{ id: string; title: string; description?: string | null }>
  >([]);
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draftContextId, setDraftContextId] = useState<string | null>(null);

  const linkedCount = selectedContextIds.size;
  const allCount = contextProjects.length + contextPrds.length;

  const contextStorageKey = useMemo(() => {
    if (!workspaceId) return null;
    const scope = projectId ?? "workspace";
    return `roadmap_context_draft:${workspaceId}:${scope}`;
  }, [workspaceId, projectId]);

  const contextTag = useMemo(() => {
    if (chatId) return `roadmap_chat:${chatId}`;
    if (draftContextId) return `roadmap_draft:${draftContextId}`;
    return null;
  }, [chatId, draftContextId]);

  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const storedAuth = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth) as { id?: string };
        if (parsed?.id) {
          return parsed.id;
        }
      } catch {
        // ignore
      }
    }
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  useEffect(() => {
    if (!contextStorageKey || chatId) return;
    if (typeof window === "undefined") return;
    let existing = window.sessionStorage.getItem(contextStorageKey);
    if (!existing) {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        existing = crypto.randomUUID();
      } else {
        existing = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      window.sessionStorage.setItem(contextStorageKey, existing);
    }
    setDraftContextId(existing);
  }, [contextStorageKey, chatId]);

  useEffect(() => {
    if (!workspaceId || !chatId || !draftContextId || !contextStorageKey) return;
    const draftTag = `roadmap_draft:${draftContextId}`;
    const nextTag = `roadmap_chat:${chatId}`;
    if (draftTag === nextTag) return;
    const migrate = async () => {
      try {
        const entries = await listKnowledgeBaseEntries(
          workspaceId,
          { tag: draftTag, limit: 200 },
          userId
        );
        await Promise.all(
          entries.map((entry) =>
            updateKnowledgeBaseEntry(
              workspaceId,
              entry.id,
              {
                tags: Array.from(
                  new Set(
                    [...(entry.tags ?? [])]
                      .filter((tag) => tag !== draftTag)
                      .concat(["roadmap", "context", nextTag])
                  )
                ),
              },
              userId
            )
          )
        );
        window.sessionStorage.removeItem(contextStorageKey);
        setDraftContextId(null);
      } catch {
        // ignore migration failures
      }
    };
    migrate();
  }, [workspaceId, chatId, draftContextId, contextStorageKey, userId]);

  useEffect(() => {
    if (!workspaceId) return;
    const loadWorkspaceTitle = () => {
      if (typeof window === "undefined") return;
      const name = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
      if (name) {
        setProjectTitle(`${name} roadmap`);
      }
    };
    const loadProject = async () => {
      if (!projectId) {
        loadWorkspaceTitle();
        return;
      }
      try {
        const data = await getProject(projectId, workspaceId);
        setProjectTitle(data?.project?.title || "Project roadmap");
      } catch {
        setProjectTitle("Project roadmap");
      }
    };
    const loadRoadmap = async () => {
      try {
        const data = projectId
          ? await fetchRoadmap(projectId, workspaceId)
          : await fetchWorkspaceRoadmap(workspaceId);
        if (data?.content) {
          const nextContent =
            typeof data.content === "string"
              ? normalizeRoadmapMarkdown(data.content)
              : normalizeRoadmapMarkdown(JSON.stringify(data.content, null, 2));
          setRoadmapContent(nextContent);
        }
        setLastUpdatedAt(data?.updated_at || data?.created_at || null);
      } catch {
        setRoadmapContent(null);
      }
    };
    loadProject();
    loadRoadmap();
  }, [workspaceId, projectId]);

  useEffect(() => {
    if (!workspaceId) return;
    const loadContextSources = async () => {
      try {
        const projectData = await getProjects(workspaceId);
        const projectList = Array.isArray(projectData) ? projectData : projectData?.projects ?? [];
        setContextProjects(
          projectList.map((project: any) => ({
            id: project.id,
            title: project.title,
            description: project.description,
          }))
        );
      } catch {
        setContextProjects([]);
      }
      try {
        const prdList = await getWorkspacePrds(workspaceId);
        setContextPrds(
          prdList.map((prd) => ({
            id: prd.id,
            title: prd.feature_name || "PRD",
            description: prd.description || prd.project_title || undefined,
          }))
        );
      } catch {
        setContextPrds([]);
      }
    };
    loadContextSources();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !contextTag) return;
    const loadContextEntries = async () => {
      setContextLoading(true);
      setContextError(null);
      try {
        const entries = await listKnowledgeBaseEntries(
          workspaceId,
          { tag: contextTag, limit: 200 },
          userId
        );
        setContextEntries(entries);
      } catch (error) {
        setContextEntries([]);
        setContextError(error instanceof Error ? error.message : "Failed to load context entries.");
      } finally {
        setContextLoading(false);
      }
    };
    loadContextEntries();
  }, [workspaceId, contextTag, userId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleSend = async (prompt?: string) => {
    if (!workspaceId) return;
    const message = (prompt ?? inputValue).trim();
    if (!message || isSending) return;

    setIsSending(true);
    setErrorMessage(null);
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const response: RoadmapChatTurnResponse = projectId
        ? await sendRoadmapChatTurn({
            workspace_id: workspaceId,
            project_id: projectId,
            prompt: message,
            chat_id: chatId,
            user_id: userId,
            context_tag: contextTag ?? null,
          })
        : await sendWorkspaceRoadmapChatTurn({
            workspace_id: workspaceId,
            prompt: message,
            chat_id: chatId,
            user_id: userId,
            context_tag: contextTag ?? null,
          });
      setChatId(response.id);
      setSuggestions(response.suggestions && response.suggestions.length > 0 ? response.suggestions : DEFAULT_SUGGESTIONS);
      const generatedRoadmap =
        response.roadmap
          ? normalizeRoadmapMarkdown(
              typeof response.roadmap === "string" ? response.roadmap : JSON.stringify(response.roadmap, null, 2)
            )
          : null;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.assistant_message || "Got it." },
        ...(generatedRoadmap ? [{ role: "assistant" as const, content: generatedRoadmap }] : []),
      ]);
      if (generatedRoadmap) {
        setRoadmapContent(generatedRoadmap);
        setLastUpdatedAt(new Date().toISOString());
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : "Failed to generate roadmap.";
      const isNetworkFetchError =
        error instanceof TypeError ||
        /failed to fetch/i.test(errMessage) ||
        /timed out/i.test(errMessage);
      if (!isNetworkFetchError) {
        setErrorMessage(errMessage);
        setIsSending(false);
        return;
      }
      try {
        const fallback = projectId
          ? await generateRoadmapChat(
              projectId,
              message,
              messages,
              userId,
              workspaceId,
              null,
              contextTag ?? null
            )
          : await generateWorkspaceRoadmapChat(
              message,
              messages,
              userId,
              workspaceId,
              null,
              contextTag ?? null
            );
        setSuggestions(fallback.suggestions && fallback.suggestions.length > 0 ? fallback.suggestions : DEFAULT_SUGGESTIONS);
        const generatedRoadmap =
          fallback.roadmap
            ? normalizeRoadmapMarkdown(
                typeof fallback.roadmap === "string" ? fallback.roadmap : JSON.stringify(fallback.roadmap, null, 2)
              )
            : null;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fallback.message || "Got it." },
          ...(generatedRoadmap ? [{ role: "assistant" as const, content: generatedRoadmap }] : []),
        ]);
        if (generatedRoadmap) {
          setRoadmapContent(generatedRoadmap);
          setLastUpdatedAt(new Date().toISOString());
        }
        setErrorMessage(null);
      } catch (fallbackError) {
        setErrorMessage(
          fallbackError instanceof Error ? fallbackError.message : "Failed to generate roadmap."
        );
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveRoadmap = async () => {
    if (!workspaceId) return;
    if (!roadmapContent || !roadmapContent.trim()) {
      setToastTone("error");
      setToastMessage("Generate a roadmap before saving.");
      return;
    }
    if (isSavingRoadmap) return;
    setIsSavingRoadmap(true);
    try {
      const saved = projectId
        ? await saveRoadmap(projectId, workspaceId, roadmapContent)
        : await saveWorkspaceRoadmap(workspaceId, roadmapContent);
      setLastUpdatedAt(saved.updated_at || new Date().toISOString());
      setToastTone("success");
      setToastMessage("Roadmap saved.");
    } catch (error) {
      setToastTone("error");
      setToastMessage(error instanceof Error ? error.message : "Failed to save roadmap.");
    } finally {
      setIsSavingRoadmap(false);
    }
  };

  const refreshContextEntries = async () => {
    if (!workspaceId || !contextTag) return;
    try {
      const entries = await listKnowledgeBaseEntries(
        workspaceId,
        { tag: contextTag, limit: 200 },
        userId
      );
      setContextEntries(entries);
    } catch {
      // ignore refresh errors
    }
  };

  const handleAddNote = async () => {
    if (!workspaceId || !contextTag) {
      setNoteError("Open a roadmap session before adding notes.");
      return;
    }
    if (!noteContent.trim()) {
      setNoteError("Add a note before saving.");
      return;
    }
    setNoteError(null);
    setIsSavingNote(true);
    try {
      const tags = ["roadmap", "context", "note", contextTag];
      if (projectId) tags.push(`project:${projectId}`);
      await createKnowledgeBaseEntry(
        workspaceId,
        {
          type: "roadmap",
          title: noteTitle.trim() || "Roadmap Note",
          content: noteContent.trim(),
          project_id: projectId ?? undefined,
          tags,
        },
        userId
      );
      setNoteTitle("");
      setNoteContent("");
      setShowNoteModal(false);
      setToastTone("success");
      setToastMessage("Note added to context.");
      refreshContextEntries();
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Unable to add the note right now.");
      setToastTone("error");
      setToastMessage("Unable to add the note right now.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleUploadFile = async () => {
    if (!workspaceId || !contextTag) {
      setUploadError("Open a roadmap session before uploading files.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Choose a file to upload.");
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const data = new FormData();
      data.append("file", uploadFile);
      data.append("title", uploadTitle || uploadFile.name);
      data.append("entry_type", "document");
      if (projectId) {
        data.append("project_id", projectId);
      }
      data.append("tags", ["roadmap", "context", "file", contextTag].join(","));
      await uploadKnowledgeBaseEntry(workspaceId, data, userId);
      setUploadFile(null);
      setUploadTitle("");
      setShowUploadModal(false);
      setToastTone("success");
      setToastMessage("File uploaded to context.");
      refreshContextEntries();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to upload file right now.");
      setToastTone("error");
      setToastMessage("Unable to upload file right now.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleLinkContext = async () => {
    if (!workspaceId || !contextTag) {
      setToastTone("error");
      setToastMessage("Open a roadmap session before linking context.");
      return;
    }
    const selectedProjects = contextProjects
      .filter((project) => selectedContextIds.has(project.id))
      .map((project) => project.id);
    const selectedPrds = contextPrds
      .filter((prd) => selectedContextIds.has(prd.id))
      .map((prd) => prd.id);
    if (!selectedProjects.length && !selectedPrds.length) {
      return;
    }
    try {
      await linkRoadmapContext({
        workspace_id: workspaceId,
        user_id: userId ?? undefined,
        context_tag: contextTag,
        project_ids: selectedProjects,
        prd_ids: selectedPrds,
      });
      setSelectedContextIds(new Set());
      setContextModalOpen(false);
      setToastTone("success");
      setToastMessage("Context linked to roadmap.");
      refreshContextEntries();
    } catch (error) {
      setToastTone("error");
      setToastMessage(error instanceof Error ? error.message : "Unable to link context.");
    }
  };

  const toggleContextItem = (itemId: string) => {
    setSelectedContextIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const noteEntries = contextEntries.filter((entry) => entry.tags.includes("note"));
  const fileEntries = contextEntries.filter(
    (entry) => entry.tags.includes("file") || entry.type === "document"
  );
  const linkEntries = contextEntries.filter((entry) => entry.tags.includes("link"));
  const hasContext = contextEntries.length > 0;

  return (
    <div className="h-screen overflow-hidden bg-white">
      <header className="border-b border-[#e5e7eb]">
        <div className="px-8 py-4">
          <div className="flex h-[48px] items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                onClick={() => {
                  if (workspaceId) {
                    navigate(`/workspaces/${workspaceId}/roadmaps`);
                    return;
                  }
                  navigate(-1);
                }}
              >
                <RBIcon name="back" className="h-4 w-4" />
                Back
              </button>
              <div className="h-6 w-px bg-[#d1d5dc]" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#eef2ff]">
                  <RBIcon name="header" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                    Roadmap Builder
                  </p>
                  <p className="text-[14px] text-[#6a7282]">{projectTitle}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 items-center rounded-[10px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                onClick={handleSaveRoadmap}
                disabled={isSavingRoadmap}
              >
                {isSavingRoadmap ? "Saving..." : "Save Roadmap"}
              </button>
              <div className="rounded-full border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6a7282]">
                Updated {formatUpdatedAt(lastUpdatedAt)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-97px)] overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col border-r border-[#e5e7eb]">
          <div className="border-b border-[#e5e7eb] bg-white px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-[#98a2b3]">
                  Roadmap assistant
                </p>
                <h2 className="text-[20px] font-semibold tracking-[-0.3125px] text-[#101828]">
                  {`Plan with ${botName}`}
                </h2>
                <p className="text-[13px] text-[#6a7282]">
                  I can help structure your roadmap and keep the preview updated in real time.
                </p>
              </div>
              <div className="rounded-full border border-[#e5e7eb] px-3 py-1 text-[12px] text-[#6a7282]">
                Live preview
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
            <div className="space-y-6">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[640px] rounded-[16px] px-4 py-3 text-[14px] leading-[22px] ${
                        isUser
                          ? "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white"
                          : "border border-[#e5e7eb] bg-white text-[#101828]"
                      }`}
                    >
                      {isUser ? (
                        message.content
                      ) : (
                        <div className="prose prose-sm max-w-none text-[#101828]">
                          <SafeMarkdown>{message.content}</SafeMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isSending && (
                <div className="flex justify-start">
                  <div className="max-w-[640px] rounded-[16px] border border-[#e5e7eb] bg-white px-4 py-3 text-[14px] leading-[22px] text-[#101828]">
                    <TypingIndicator label={botName} />
                  </div>
                </div>
              )}
              {errorMessage && <p className="text-[13px] text-[#fb2c36]">{errorMessage}</p>}
            </div>
          </div>
          <div className="sticky bottom-0 border-t border-[#e5e7eb] bg-white px-6 py-4">
            {suggestions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[12px] font-medium text-[#4a5565]"
                    onClick={() => handleSend(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                className="h-10 flex-1 rounded-[10px] bg-[#f3f3f5] px-4 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="Describe the roadmap you want..."
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSend();
                  }
                }}
              />
              <button
                type="button"
                className="flex h-10 w-11 items-center justify-center rounded-[10px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white disabled:opacity-50"
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isSending}
              >
                <RBIcon name="send" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </main>

        <aside className="flex h-full w-[384px] flex-col overflow-hidden bg-[#f9fafb]">
          <div className="border-b border-[#e5e7eb] bg-white">
            <div className="flex items-center gap-1 px-4">
              <button
                type="button"
                className={`h-[46px] border-b-2 px-4 text-[14px] font-medium ${
                  rightTab === "preview" ? "border-[#9810fa] text-[#9810fa]" : "border-transparent text-[#4a5565]"
                }`}
                onClick={() => setRightTab("preview")}
              >
                Timeline Preview
              </button>
              <button
                type="button"
                className={`h-[46px] border-b-2 px-4 text-[14px] font-medium ${
                  rightTab === "context" ? "border-[#9810fa] text-[#9810fa]" : "border-transparent text-[#4a5565]"
                }`}
                onClick={() => setRightTab("context")}
              >
                Context
              </button>
            </div>
          </div>
          {rightTab === "preview" ? (
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                <RBIcon name="preview" className="h-4 w-4" />
                Roadmap preview
              </div>
              <p className="mt-2 text-[12px] text-[#6a7282]">Live output generated from your chat.</p>
              <div className="mt-6 rounded-[16px] border border-[#e5e7eb] bg-white p-5 text-[14px] text-[#101828]">
                {roadmapContent ? (
                  <div className="prose max-w-none text-[14px] text-[#101828]">
                    <SafeMarkdown>{roadmapContent}</SafeMarkdown>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#6a7282]">
                    {`No roadmap yet. Ask ${botName} to generate one and the preview will appear here.`}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-[#e5e7eb] bg-white px-4 py-4">
                <p className="text-[12px] text-[#6a7282]">Add context to inform your roadmap</p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                    onClick={() => setContextModalOpen(true)}
                  >
                    <RBIcon name="link" className="h-4 w-4" />
                    Link PRD or Project
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <RBIcon name="upload" className="h-4 w-4" />
                    Upload File
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                    onClick={() => setShowNoteModal(true)}
                  >
                    <RBIcon name="note" className="h-4 w-4" />
                    Add Note
                  </button>
                </div>
              </div>
              {contextLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                  <p className="text-[14px] text-[#6a7282]">Loading context...</p>
                </div>
              ) : hasContext ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
                  {contextError && <p className="text-[12px] text-[#fb2c36]">{contextError}</p>}
                  {linkEntries.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6a7282]">
                        Linked context
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        {linkEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] text-[#101828]"
                          >
                            <p className="font-semibold">{entry.title}</p>
                            {entry.content && (
                              <p className="mt-1 text-[12px] text-[#6a7282]">{entry.content}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {noteEntries.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6a7282]">Notes</p>
                      <div className="mt-2 flex flex-col gap-2">
                        {noteEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] text-[#101828]"
                          >
                            <p className="font-semibold">{entry.title}</p>
                            {entry.content && (
                              <p className="mt-1 text-[12px] text-[#6a7282]">{entry.content}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {fileEntries.length > 0 && (
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6a7282]">Files</p>
                      <div className="mt-2 flex flex-col gap-2">
                        {fileEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] text-[#101828]"
                          >
                            <p className="font-semibold">{entry.title}</p>
                            {workspaceId && entry.file_url && (
                              <a
                                className="mt-1 block text-[12px] text-[#7c3aed]"
                                href={knowledgeEntryDownloadUrl(workspaceId, entry.id, userId ?? undefined)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View file
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                  <RBIcon name="empty" className="h-8 w-8" />
                  <p className="text-[14px] text-[#6a7282]">No context added yet</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {contextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[768px] overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-[0px_25px_50px_0px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-4 border-b border-[#e5e7eb] px-6 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, rgba(0, 201, 80, 1) 0%, rgba(0, 188, 125, 1) 100%)",
                    }}
                  >
                    <RBIcon name="add" className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold text-[#101828]">Add Context to Roadmap</p>
                    <p className="text-[14px] text-[#6a7282]">
                      Select items to give your roadmap relevant context
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center text-[#98a2b3]"
                  onClick={() => setContextModalOpen(false)}
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-[12px] px-3 py-1.5 text-[12px] font-medium ${
                    contextTab === "all"
                      ? "bg-[#9810fa] text-white shadow-sm"
                      : "bg-white text-[#4a5565] border border-[#e5e7eb]"
                  }`}
                  onClick={() => setContextTab("all")}
                >
                  <RBIcon name="all" className="h-4 w-4" />
                  All ({allCount})
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-[12px] px-3 py-1.5 text-[12px] font-medium ${
                    contextTab === "projects"
                      ? "bg-[#9810fa] text-white shadow-sm"
                      : "bg-white text-[#4a5565] border border-[#e5e7eb]"
                  }`}
                  onClick={() => setContextTab("projects")}
                >
                  <RBIcon name="projects" className="h-4 w-4" />
                  Projects ({contextProjects.length})
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-[12px] px-3 py-1.5 text-[12px] font-medium ${
                    contextTab === "prds"
                      ? "bg-[#9810fa] text-white shadow-sm"
                      : "bg-white text-[#4a5565] border border-[#e5e7eb]"
                  }`}
                  onClick={() => setContextTab("prds")}
                >
                  <RBIcon name="prds" className="h-4 w-4" />
                  PRDs ({contextPrds.length})
                </button>
              </div>
            </div>

            <div className="max-h-[520px] overflow-y-auto px-6 py-4">
              {(contextTab === "all" || contextTab === "projects") && (
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#f3e8ff]">
                      <RBIcon name="projects" className="h-3 w-3 text-[#7c3aed]" />
                    </div>
                    <p className="text-[14px] font-semibold text-[#101828]">Projects</p>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {contextProjects.map((item) => {
                      const checked = selectedContextIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3 text-left"
                          onClick={() => toggleContextItem(item.id)}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-[4px] border-2 ${
                              checked ? "border-[#9810fa] bg-[#9810fa]" : "border-[#d1d5dc] bg-white"
                            }`}
                          >
                            {checked && (
                              <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
                                <path
                                  d="M4 8.5l2.5 2.5L12 5.5"
                                  stroke="white"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                />
                              </svg>
                            )}
                          </span>
                          <RBIcon name="projects" className="h-4 w-4 text-[#7c3aed]" />
                          <span className="text-[14px] font-medium text-[#101828]">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(contextTab === "all" || contextTab === "prds") && (
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#f3e8ff]">
                      <RBIcon name="prds" className="h-3 w-3 text-[#7c3aed]" />
                    </div>
                    <p className="text-[14px] font-semibold text-[#101828]">PRDs</p>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {contextPrds.map((item) => {
                      const checked = selectedContextIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3 text-left"
                          onClick={() => toggleContextItem(item.id)}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-[4px] border-2 ${
                              checked ? "border-[#9810fa] bg-[#9810fa]" : "border-[#d1d5dc] bg-white"
                            }`}
                          >
                            {checked && (
                              <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
                                <path
                                  d="M4 8.5l2.5 2.5L12 5.5"
                                  stroke="white"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                />
                              </svg>
                            )}
                          </span>
                          <RBIcon name="prds" className="h-4 w-4 text-[#7c3aed]" />
                          <span className="text-[14px] font-medium text-[#101828]">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-5">
              <div className="flex items-center gap-2 text-[#4a5565]">
                <RBIcon name="linked" className="h-4 w-4" />
                <span className="text-[14px]">{linkedCount} linked</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 rounded-[8px] border border-black/10 bg-white px-4 text-[14px] font-medium text-[#0a0a0a]"
                  onClick={() => setContextModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-[14px] font-medium text-white ${
                    linkedCount === 0
                      ? "bg-gradient-to-r from-[#9810fa]/50 to-[#155dfc]/50"
                      : "bg-gradient-to-r from-[#9810fa] to-[#155dfc]"
                  }`}
                  disabled={linkedCount === 0}
                  onClick={handleLinkContext}
                >
                  <RBIcon name="add" className="h-4 w-4" />
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[560px] rounded-[16px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f4ebff]">
                  <RBIcon name="note" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Add note</p>
                  <p className="text-[14px] text-[#6a7282]">Capture context to guide this roadmap.</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowNoteModal(false)}
              >
                <span className="text-[18px] text-[#98a2b3]">×</span>
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="text-[14px] font-medium text-[#364153]">Title</label>
              <input
                className="mt-2 h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="e.g., Customer constraints or success metrics"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
              />

              <label className="mt-4 block text-[14px] font-medium text-[#364153]">Note</label>
              <textarea
                className="mt-2 min-h-[140px] w-full resize-none rounded-[12px] border border-[#e5e7eb] px-3 py-2 text-[14px] text-[#101828] placeholder:text-[#99a1af]"
                placeholder="Add details that should influence the roadmap..."
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value.slice(0, 1000))}
              />
              <div className="mt-2 flex items-center justify-between text-[12px] text-[#99a1af]">
                <span>Be specific so the assistant can reuse this context.</span>
                <span>{noteContent.length}/1000</span>
              </div>
              {noteError && <p className="mt-2 text-[12px] text-[#fb2c36]">{noteError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#e5e7eb] px-6 py-4">
              <button
                type="button"
                className="h-10 rounded-[10px] border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#364153]"
                onClick={() => setShowNoteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-[10px] bg-[#6d28d9] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
                disabled={isSavingNote}
                onClick={handleAddNote}
              >
                {isSavingNote ? "Saving..." : "Save note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[560px] rounded-[16px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#eef2ff]">
                  <RBIcon name="upload" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Upload file</p>
                  <p className="text-[14px] text-[#6a7282]">Add reference docs to guide the roadmap.</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowUploadModal(false)}
              >
                <span className="text-[18px] text-[#98a2b3]">×</span>
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="text-[14px] font-medium text-[#364153]">Title</label>
              <input
                className="mt-2 h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="e.g., Research brief or competitive analysis"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
              />

              <div className="mt-4 rounded-[16px] border border-dashed border-[#d4d4d8] bg-[#fafafa] px-4 py-6 text-center">
                <input
                  type="file"
                  className="hidden"
                  id="roadmap-context-upload"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file && !uploadTitle) {
                      setUploadTitle(file.name);
                    }
                  }}
                />
                <label
                  htmlFor="roadmap-context-upload"
                  className="inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-2 text-[14px] font-medium text-[#101828]"
                >
                  Choose file
                </label>
                <p className="mt-3 text-[12px] text-[#6a7282]">
                  {uploadFile ? uploadFile.name : "PDF, DOCX, TXT, or MD up to 10 MB"}
                </p>
              </div>
              {uploadError && <p className="mt-3 text-[12px] text-[#fb2c36]">{uploadError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#e5e7eb] px-6 py-4">
              <button
                type="button"
                className="h-10 rounded-[10px] border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#364153]"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-[10px] bg-[#6d28d9] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
                disabled={isUploading}
                onClick={handleUploadFile}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed left-1/2 top-6 z-[60] -translate-x-1/2">
          <div
            className={`rounded-[10px] px-4 py-2 text-[14px] font-medium shadow-[0px_10px_20px_rgba(0,0,0,0.12)] ${
              toastTone === "success" ? "bg-[#22c55e] text-white" : "bg-[#fb2c36] text-white"
            }`}
          >
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}
