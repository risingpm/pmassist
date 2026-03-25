import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

import backArrow from "../assets/prd-new/header-back.svg";
import docIcon from "../assets/prd-new/header-doc.svg";
import projectIcon from "../assets/prd-new/project-icon.svg";
import chevronDown from "../assets/prd-new/chevron-down.svg";
import previewIcon from "../assets/prd-new/header-preview.svg";
import headerIcon1 from "../assets/prd-new/header-icon-1.svg";
import headerIcon2 from "../assets/prd-new/header-icon-2.svg";
import browseIcon from "../assets/prd-new/browse-templates.svg";
import botIcon from "../assets/prd-new/bot-icon.svg";
import sendIcon from "../assets/prd-new/send-icon.svg";
import clipVec1 from "../assets/prd-new/clip-vec-1.svg";
import clipVec2 from "../assets/prd-new/clip-vec-2.svg";
import panelClose from "../assets/prd-new/panel-close.svg";
import tabContext from "../assets/prd-new/tab-context.svg";
import uploadIcon from "../assets/prd-new/upload-icon.svg";
import noteIcon from "../assets/prd-new/note-icon.svg";
import emptyStateIcon from "../assets/prd-new/empty-state.svg";
import TypingIndicator from "../components/TypingIndicator";
import { getStoredAgentName } from "../utils/agentProfile";
import { buildMessageWithAttachments } from "../utils/chatAttachments";
const chatIcon = "https://www.figma.com/api/mcp/asset/86c14b18-8fd2-4570-911a-64f6d05b8bff";
import {
  createPrd,
  createPrdNote,
  attachPrdToProject,
  createWorkspacePrd,
  exportPrd,
  exportWorkspacePrd,
  getProjects,
  getWorkspacePrds,
  getWorkspacePrd,
  getWorkspacePrdMessages,
  refinePrd,
  refineWorkspacePrd,
  savePrdVersion,
  saveWorkspacePrdVersion,
  uploadKnowledgeBaseEntry,
} from "../api";
import { SELECTED_PRD_TEMPLATE_KEY } from "../constants";

export default function NewPrd() {
  type ChatMessage = {
    id: string;
    role: "assistant" | "user";
    content: string;
    timestamp: string;
    action?: "download";
  };
  const navigate = useNavigate();
  const { workspaceId, prdId } = useParams<{ workspaceId?: string; prdId?: string }>();
  const [searchParams] = useSearchParams();
  const botName = useMemo(() => getStoredAgentName(), []);
  const lastPrdStorageKey = useMemo(
    () => (workspaceId ? `pmassist:last-prd:${workspaceId}` : null),
    [workspaceId]
  );
  const introMessage = useMemo(
    () =>
      `Hi! I'm ${botName}, your AI assistant. I'll help you create a comprehensive PRD. Tell me about your product idea and I'll guide you through the process.`,
    [botName]
  );
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePrdId, setActivePrdId] = useState<string | null>(null);
  const [activePrdContent, setActivePrdContent] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState("Untitled PRD");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [headerProjectMenuOpen, setHeaderProjectMenuOpen] = useState(false);
  const [contextProjectMenuOpen, setContextProjectMenuOpen] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [activePrdProjectId, setActivePrdProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "preview">("chat");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteEntries, setNoteEntries] = useState<
    Array<{ id: string; title: string; content?: string | null; created_at?: string }>
  >([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileEntries, setFileEntries] = useState<
    Array<{ id: string; title: string; file_url?: string | null; created_at?: string }>
  >([]);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; title: string; content?: string | null }>
  >([]);
  const [isUploadingChatAttachment, setIsUploadingChatAttachment] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  const projectId = useMemo(() => searchParams.get("projectId"), [searchParams]);
  const headerProjectLabel = activePrdProjectId
    ? projects.find((project) => project.id === activePrdProjectId)?.title || "Project Selected"
    : "No Project";
  const selectedProjectLabel = activePrdProjectId
    ? projects.find((project) => project.id === activePrdProjectId)?.title || "Project Selected"
    : "No Project";
  const canSelectProject = projects.length > 0;
  const canAddNote = Boolean(workspaceId);
  const messageCount = messages.filter((message) => message.role === "user").length;
  const lastUpdatedLabel = lastUpdatedAt
    ? `Last updated ${new Date(lastUpdatedAt).toLocaleDateString()}`
    : "Last updated";
  const previewSections = [
    {
      title: "Overview",
      placeholder: `Chat with ${botName} to define the overview of your product or feature...`,
    },
    {
      title: "Problem Statement",
      placeholder: "Define the problem you're solving for your users...",
    },
    {
      title: "User Stories",
      placeholder: `User stories will be generated based on your conversation with ${botName}...`,
    },
    {
      title: "Requirements",
      placeholder: "Functional and technical requirements will appear here...",
    },
    {
      title: "Success Metrics",
      placeholder: "Define how you'll measure the success of this initiative...",
    },
    {
      title: "Timeline",
      placeholder: "Project timeline and key milestones will be outlined here...",
    },
  ];
  const hasNotes = noteEntries.length > 0;
  const hasFiles = fileEntries.length > 0;
  const hasContext = hasNotes || hasFiles;
  const noteList = (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
      {noteEntries.map((note) => (
        <div key={note.id} className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#101828]">{note.title}</p>
            {note.created_at && (
              <span className="text-[11px] text-[#6a7282]">
                {new Date(note.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          {note.content && (
            <p className="mt-1 text-[13px] leading-[18px] text-[#4a5565]">
              {note.content.length > 120 ? `${note.content.slice(0, 120)}…` : note.content}
            </p>
          )}
        </div>
      ))}
    </div>
  );
  const fileList = (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-0">
      {fileEntries.map((file) => (
        <div key={file.id} className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#101828]">{file.title}</p>
            {file.created_at && (
              <span className="text-[11px] text-[#6a7282]">
                {new Date(file.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#6a7282]">Uploaded file</p>
        </div>
      ))}
    </div>
  );
  useEffect(() => {
    const queryTemplate = searchParams.get("templateId");
    if (queryTemplate) {
      setSelectedTemplateId(queryTemplate);
      return;
    }
    if (typeof window !== "undefined") {
      const storedTemplate = window.sessionStorage.getItem(SELECTED_PRD_TEMPLATE_KEY);
      if (storedTemplate) {
        setSelectedTemplateId(storedTemplate);
        window.sessionStorage.removeItem(SELECTED_PRD_TEMPLATE_KEY);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!workspaceId) return;
    getProjects(workspaceId)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.projects;
        if (!Array.isArray(list)) {
          setProjects([]);
          return;
        }
        setProjects(
          list.map((project) => ({
            id: project.id,
            title: project.title || "Untitled Project",
          }))
        );
      })
      .catch(() => {
        setProjects([]);
      });
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const applyPrdThread = async (candidatePrdId: string) => {
      const [prd, history] = await Promise.all([
        getWorkspacePrd(candidatePrdId, workspaceId),
        getWorkspacePrdMessages(candidatePrdId, workspaceId),
      ]);
      setActivePrdId(prd.id);
      setActivePrdProjectId(prd.project_id ?? null);
      setActivePrdContent(prd.content || "");
      setLastUpdatedAt(prd.updated_at);
      setSaveTitle(prd.feature_name || "Untitled PRD");
      if (history.length) {
        const mapped = history.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }));
        setMessages(mapped);
      } else {
        setMessages([
          {
            id: "intro",
            role: "assistant" as const,
            content: introMessage,
            timestamp: "01:02 PM",
          },
        ]);
      }
      if (lastPrdStorageKey && typeof window !== "undefined") {
        window.sessionStorage.setItem(lastPrdStorageKey, prd.id);
      }
      if (!prdId) {
        navigate(`/workspaces/${workspaceId}/prd/${prd.id}`, { replace: true });
      }
    };

    if (!prdId) {
      const restoreLatestPrd = async () => {
        const candidateIds: string[] = [];
        if (lastPrdStorageKey && typeof window !== "undefined") {
          const stored = window.sessionStorage.getItem(lastPrdStorageKey);
          if (stored) {
            candidateIds.push(stored);
          }
        }
        try {
          const latest = await getWorkspacePrds(workspaceId);
          if (latest.length && !candidateIds.includes(latest[0].id)) {
            candidateIds.push(latest[0].id);
          }
        } catch {
          // Non-blocking: we can still open a fresh chat.
        }

        for (const candidate of candidateIds) {
          try {
            await applyPrdThread(candidate);
            return;
          } catch {
            if (lastPrdStorageKey && typeof window !== "undefined") {
              window.sessionStorage.removeItem(lastPrdStorageKey);
            }
          }
        }

        setMessages([
          {
            id: "intro",
            role: "assistant" as const,
            content: introMessage,
            timestamp: "01:02 PM",
          },
        ]);
      };
      restoreLatestPrd();
      return;
    }

    const fetchPrd = async () => {
      try {
        await applyPrdThread(prdId);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load PRD.");
      }
    };

    fetchPrd();
  }, [workspaceId, prdId, introMessage, navigate, lastPrdStorageKey]);

  useEffect(() => {
    if (!activePrdId || !lastPrdStorageKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(lastPrdStorageKey, activePrdId);
  }, [activePrdId, lastPrdStorageKey]);

  const handleBack = () => {
    if (workspaceId) {
      navigate(`/workspaces/${workspaceId}/home`);
      return;
    }
    navigate(-1);
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && pendingAttachments.length === 0) || isSending || isUploadingChatAttachment) return;

    const userMessage = buildMessageWithAttachments(
      inputValue.trim(),
      pendingAttachments,
      "Please use the attached files as context for this PRD."
    );
    setInputValue("");
    setStatusMessage(null);
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user" as const,
        content: userMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    const wantsDownload = /\b(download|export)\b.*\b(prd|document)\b|\b(download|export)\b/i.test(userMessage);
    if (wantsDownload) {
      if (!activePrdId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant" as const,
            content: "Please save the PRD first, then I can download it for you.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setIsSending(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant" as const,
          content: "Ready when you are.",
          action: "download" as const,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setIsSending(false);
      return;
    }

    if (!workspaceId) {
      setStatusMessage("Select a workspace to create a PRD.");
      setIsSending(false);
      return;
    }

    try {
      const targetProjectId = activePrdProjectId || projectId;
      if (!activePrdId) {
        const prd = targetProjectId
          ? await createPrd(targetProjectId, workspaceId, {
              feature_name: "New PRD",
              prompt: userMessage,
              template_id: selectedTemplateId || undefined,
            })
          : await createWorkspacePrd(workspaceId, {
              feature_name: "New PRD",
              prompt: userMessage,
              template_id: selectedTemplateId || undefined,
            });
        setActivePrdId(prd.id);
        setLastUpdatedAt(prd.updated_at);
        setActivePrdProjectId(prd.project_id ?? projectId ?? null);
        navigate(`/workspaces/${workspaceId}/prd/${prd.id}`, { replace: true });
        if (prd.content) {
          setActivePrdContent(prd.content);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant" as const,
            content: prd.assistant_message || prd.content || "Draft created.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setPendingAttachments([]);
        return;
      }

      const refined = targetProjectId
        ? await refinePrd(targetProjectId, activePrdId, workspaceId, userMessage, selectedTemplateId || undefined)
        : await refineWorkspacePrd(activePrdId, workspaceId, userMessage, selectedTemplateId || undefined);
      setActivePrdId(refined.id);
      setLastUpdatedAt(refined.updated_at);
      setActivePrdProjectId(refined.project_id ?? activePrdProjectId ?? projectId ?? null);
      navigate(`/workspaces/${workspaceId}/prd/${refined.id}`, { replace: true });
      if (refined.content) {
        setActivePrdContent(refined.content);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant" as const,
          content: refined.assistant_message || refined.content || "PRD refined.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setPendingAttachments([]);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to generate PRD.");
    } finally {
      setIsSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!workspaceId) {
      setStatusMessage("Select a workspace to add notes.");
      return;
    }
    if (!noteContent.trim()) {
      setStatusMessage("Add a note before saving.");
      return;
    }
    try {
      const projectRef = activePrdProjectId || projectId;
      const tags = ["prd", "context", activePrdId ? `prd:${activePrdId}` : "prd:pending"];
      if (projectRef) {
        tags.push(`project:${projectRef}`);
      }
      const created = await createPrdNote(
        workspaceId,
        {
          title: noteTitle || "PRD Note",
          content: noteContent.trim(),
          tags,
          prd_id: activePrdId || undefined,
        },
        activePrdId
      );
      setNoteEntries((prev) => [created, ...prev]);
      setNoteTitle("");
      setNoteContent("");
      setShowNoteModal(false);
      setStatusMessage("Note added to PRD knowledge.");
      setToastMessage("Note added to context.");
    } catch {
      setStatusMessage("Unable to add the note right now.");
    }
  };

  const handleUploadFile = async () => {
    if (!workspaceId) {
      setStatusMessage("Select a workspace to upload files.");
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
      const projectRef = activePrdProjectId || projectId;
      if (projectRef) {
        data.append("project_id", projectRef);
      }
      const tags = ["prd", "context", activePrdId ? `prd:${activePrdId}` : "prd:pending"];
      data.append("tags", tags.join(","));
      const created = await uploadKnowledgeBaseEntry(workspaceId, data);
      setFileEntries((prev) => [created, ...prev]);
      setUploadFile(null);
      setUploadTitle("");
      setShowUploadModal(false);
      setStatusMessage("File uploaded to PRD context.");
      setToastMessage("File uploaded to context.");
    } catch (error) {
      setUploadError("Unable to upload file right now.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadChatAttachment = async (file: File) => {
    if (!workspaceId) {
      setStatusMessage("Select a workspace to upload files.");
      return;
    }
    setIsUploadingChatAttachment(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("title", file.name);
      data.append("entry_type", "document");
      const projectRef = activePrdProjectId || projectId;
      if (projectRef) {
        data.append("project_id", projectRef);
      }
      const tags = ["prd", "attachment", activePrdId ? `prd:${activePrdId}` : "prd:pending"];
      data.append("tags", tags.join(","));
      const created = await uploadKnowledgeBaseEntry(workspaceId, data);
      setPendingAttachments((prev) => [...prev, { id: created.id, title: created.title, content: created.content }]);
      setFileEntries((prev) => [created, ...prev]);
      setStatusMessage("Attachment uploaded.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to upload file right now.");
    } finally {
      setIsUploadingChatAttachment(false);
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleSave = async () => {
    if (!workspaceId || !activePrdId) return;
    try {
      setStatusMessage(null);
      const payload = {
        content: activePrdContent,
        feature_name: saveTitle.trim() || "Untitled PRD",
        description: selectedTemplateId ? "Generated from template" : undefined,
      };
      const saveProjectId = activePrdProjectId || projectId;
      if (saveProjectId) {
        const saved = await savePrdVersion(saveProjectId, activePrdId, workspaceId, payload);
        setLastUpdatedAt(saved.updated_at);
        if (saved.content) {
          setActivePrdContent(saved.content);
        }
      } else {
        const saved = await saveWorkspacePrdVersion(activePrdId, workspaceId, payload);
        setLastUpdatedAt(saved.updated_at);
        if (saved.content) {
          setActivePrdContent(saved.content);
        }
      }
      setStatusMessage("PRD saved.");
      setShowSaveModal(false);
      setViewMode("preview");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save PRD.");
    }
  };

  const handleDownload = async () => {
    const downloadProjectId = activePrdProjectId || projectId;
    if (!workspaceId || !activePrdId) {
      setStatusMessage("Save the PRD before downloading.");
      return;
    }
    try {
      setStatusMessage(null);
      if (downloadProjectId) {
        await exportPrd(downloadProjectId, activePrdId, workspaceId);
      } else {
        await exportWorkspacePrd(activePrdId, workspaceId);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to download PRD.");
    }
  };

  const handleAttachToProject = async () => {
    if (!workspaceId || !activePrdId || !pendingProjectId) {
      setStatusMessage("Start the PRD before adding it to a project.");
      setShowAttachModal(false);
      return;
    }
    try {
      setStatusMessage(null);
      await attachPrdToProject(workspaceId, activePrdId, pendingProjectId);
      setActivePrdProjectId(pendingProjectId);
      setShowAttachModal(false);
      setToastMessage("PRD added to project.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to add PRD to project.");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="h-[65px] border-b border-[#e5e7eb]">
        <div className="flex h-full items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={handleBack} className="flex h-8 items-center gap-2 rounded-lg px-2 text-[#0a0a0a]">
              <img alt="" className="h-4 w-4" src={backArrow} />
              <span className="text-[14px] font-medium tracking-[-0.1504px]">Back</span>
            </button>
            <div className="h-6 w-px bg-[#d1d5dc]" />
            <div className="flex items-center gap-2">
              <img alt="" className="h-5 w-5" src={docIcon} />
              <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">New PRD</p>
            </div>
            <div className="h-6 w-px bg-[#d1d5dc]" />
            <div className="relative">
              <button
                type="button"
                className="flex h-8 min-w-[145px] items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                onClick={() => {
                  if (!projects.length) {
                    setStatusMessage("Create a project to link this PRD.");
                    return;
                  }
                  setHeaderProjectMenuOpen((prev) => !prev);
                }}
              >
                <img alt="" className="h-4 w-4" src={projectIcon} />
                <span className="whitespace-nowrap">{headerProjectLabel}</span>
                <img alt="" className="ml-auto h-4 w-4" src={chevronDown} />
              </button>
              {headerProjectMenuOpen && (
                <div className="absolute left-0 top-[40px] z-20 w-[220px] rounded-[12px] border border-[#e5e7eb] bg-white p-2 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                      !activePrdProjectId ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                    }`}
                    onClick={() => {
                      setActivePrdProjectId(null);
                      setHeaderProjectMenuOpen(false);
                    }}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#99a1af]" />
                    No Project
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                        activePrdProjectId === project.id ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                      }`}
                      onClick={() => {
                        if (!activePrdId) {
                          setActivePrdProjectId(project.id);
                          setHeaderProjectMenuOpen(false);
                          return;
                        }
                        setPendingProjectId(project.id);
                        setHeaderProjectMenuOpen(false);
                        setShowAttachModal(true);
                      }}
                    >
                      <span className="h-2 w-2 rounded-full bg-[#ad46ff]" />
                      {project.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-lg px-3 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
              onClick={() => setViewMode(viewMode === "chat" ? "preview" : "chat")}
            >
              <img alt="" className="h-4 w-4" src={viewMode === "chat" ? previewIcon : chatIcon} />
              <span>{viewMode === "chat" ? "Preview" : "Chat"}</span>
            </button>
            <div className="h-6 w-px bg-[#d1d5dc]" />
            <button type="button" className="flex h-8 w-9 items-center justify-center rounded-lg">
              <img alt="" className="h-4 w-4" src={headerIcon1} />
            </button>
            <button type="button" className="flex h-8 w-9 items-center justify-center rounded-lg">
              <img alt="" className="h-4 w-4" src={headerIcon2} />
            </button>
            <button
              type="button"
              className="h-8 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[14px] font-medium tracking-[-0.1504px] text-white"
              onClick={() => {
                setProjectMenuOpen(false);
                setShowSaveModal(true);
              }}
              disabled={!activePrdId}
            >
              Save PRD
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)]">
        <main className="flex flex-1 flex-col">
          {viewMode === "chat" ? (
            <>
              <div className="h-[57px] border-b border-[#e5e7eb] bg-white">
                <div className="flex h-full items-center px-6">
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                    onClick={() => {
                      if (!workspaceId) {
                        setStatusMessage("Workspace not found.");
                        return;
                      }
                      navigate(`/workspaces/${workspaceId}/prds`);
                    }}
                  >
                    <img alt="" className="h-4 w-4" src={browseIcon} />
                    Browse PRDs
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#f9fafb]">
                <div className="flex flex-col gap-6 px-6 pb-24 pt-6">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    if (isUser) {
                      return (
                        <div key={message.id} className="flex items-start justify-end gap-3">
                          <div className="flex flex-col items-end gap-1">
                            <div className="rounded-[16px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-5 py-[12px] text-[14px] leading-[22.75px] text-white shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
                              {message.content}
                            </div>
                            <div className="pr-2 text-[12px] leading-[16px] text-[#99a1af]">{message.timestamp}</div>
                          </div>
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4a5565] text-[16px] font-medium text-white">
                            U
                          </div>
                        </div>
                      );
                    }

                return (
                  <div key={message.id} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                      <img alt="" className="h-4 w-4" src={botIcon} />
                    </div>
                    <div className="flex max-w-[690px] flex-col gap-1">
                      <div className="rounded-[16px] border border-[#e5e7eb] bg-white px-[21px] py-[13px] text-[14px] leading-[22.75px] text-[#101828] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
                        <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="mb-3 text-[18px] font-semibold">{children}</h1>,
                                h2: ({ children }) => <h2 className="mb-2 mt-4 text-[16px] font-semibold">{children}</h2>,
                                h3: ({ children }) => <h3 className="mb-2 mt-3 text-[15px] font-semibold">{children}</h3>,
                                p: ({ children }) => <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
                                ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
                                li: ({ children }) => <li className="mb-1">{children}</li>,
                                code: ({ children }) => (
                                  <code className="rounded bg-[#f3f3f5] px-1 py-0.5 text-[13px]">{children}</code>
                                ),
                                pre: ({ children }) => (
                                  <pre className="mb-3 overflow-x-auto rounded bg-[#0b1020] p-3 text-[12px] text-white">
                                    {children}
                                  </pre>
                                ),
                              }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        {message.action === "download" && (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={handleDownload}
                              className="inline-flex items-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-[14px] font-medium text-[#0a0a0a]"
                            >
                              Download PRD
                            </button>
                          </div>
                        )}
                      </div>
                          <div className="pl-2 text-[12px] leading-[16px] text-[#99a1af]">{message.timestamp}</div>
                        </div>
                      </div>
                    );
                  })}
                  {isSending && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                        <img alt="" className="h-4 w-4" src={botIcon} />
                      </div>
                      <div className="flex max-w-[690px] flex-col gap-1">
                        <div className="rounded-[16px] border border-[#e5e7eb] bg-white px-[21px] py-[13px] text-[14px] leading-[22.75px] text-[#101828] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
                          <TypingIndicator label={botName} />
                        </div>
                      </div>
                    </div>
                  )}
                  {statusMessage && <p className="text-[12px] text-[#6a7282]">{statusMessage}</p>}
                </div>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-[#e5e7eb] bg-white">
                <div className="flex flex-col gap-2 px-[69.5px] pb-0 pt-[17px]">
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUploadChatAttachment(file);
                        event.target.value = "";
                      }
                    }}
                  />
                  {pendingAttachments.length > 0 || isUploadingChatAttachment ? (
                    <div className="flex flex-wrap gap-2">
                      {pendingAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[12px] text-[#364153]"
                        >
                          <span className="max-w-[220px] truncate">{attachment.title}</span>
                          <button
                            type="button"
                            className="text-[#6a7282]"
                            onClick={() => setPendingAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {isUploadingChatAttachment ? (
                        <div className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[12px] text-[#6a7282]">
                          Uploading attachment...
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        className="h-12 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] py-1 pl-3 pr-12 text-[14px] tracking-[-0.1504px] text-[#101828] placeholder:text-[#717182]"
                        placeholder={`Message ${botName}...`}
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleSend();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="absolute right-[8px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center"
                        onClick={() => chatFileInputRef.current?.click()}
                        disabled={isUploadingChatAttachment}
                      >
                        <div className="relative h-5 w-5">
                          <img alt="" className="absolute inset-0 h-full w-full" src={clipVec1} />
                          <img alt="" className="absolute inset-0 h-full w-full" src={clipVec2} />
                        </div>
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`flex h-12 w-12 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] ${
                        inputValue.trim() || pendingAttachments.length > 0 ? "opacity-100" : "opacity-50"
                      }`}
                      onClick={handleSend}
                      disabled={(!inputValue.trim() && pendingAttachments.length === 0) || isSending || isUploadingChatAttachment}
                    >
                      <img alt="" className="h-4 w-4" src={sendIcon} />
                    </button>
                  </div>
                  <p className="text-center text-[12px] leading-[16px] text-[#6a7282]">
                    {botName} can help you structure your PRD, suggest content, and refine your ideas
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 bg-[#f9fafb] pl-8 pr-[47px] pt-8">
              <div className="rounded-[10px] border border-[#e5e7eb] bg-white shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
                <div className="border-b border-[#e5e7eb] px-8 pb-4 pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[30px] font-bold tracking-[0.3955px] text-[#101828]">{saveTitle}</p>
                      <div className="mt-2 flex items-center gap-3 text-[14px] text-[#6a7282]">
                        <span className="rounded-[4px] bg-[#fef9c2] px-2 py-1 text-[12px] font-medium text-[#a65f00]">
                          Draft
                        </span>
                        <span>•</span>
                        <span>{lastUpdatedLabel}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex h-8 items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                      onClick={() => setViewMode("chat")}
                    >
                      <img alt="" className="h-4 w-4" src={headerIcon1} />
                      Edit
                    </button>
                  </div>
                </div>
                <div className="px-8 py-6">
                  {activePrdContent ? (
                    <div className="prose max-w-none text-[16px] text-[#101828]">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => (
                            <h1 className="mb-4 text-[24px] font-semibold text-[#101828]">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <div className="relative mb-4 mt-6 pl-4">
                              <span className="absolute left-0 top-[4px] h-6 w-[4px] rounded-[4px] bg-[#9810fa]" />
                              <h2 className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                                {children}
                              </h2>
                            </div>
                          ),
                          h3: ({ children }) => <h3 className="mb-2 mt-4 text-[18px] font-semibold">{children}</h3>,
                          p: ({ children }) => <p className="mb-3 whitespace-pre-wrap text-[16px]">{children}</p>,
                          ul: ({ children }) => <ul className="mb-3 list-disc pl-5">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-3 list-decimal pl-5">{children}</ol>,
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                        }}
                      >
                        {activePrdContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {previewSections.map((section) => (
                        <div key={section.title} className="relative pl-4">
                          <span className="absolute left-0 top-[4px] h-6 w-[4px] rounded-[4px] bg-[#9810fa]" />
                          <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                            {section.title}
                          </p>
                          <p className="mt-2 text-[16px] italic text-[#99a1af]">{section.placeholder}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-[#e5e7eb] bg-[#f9fafb] px-8 py-4 text-[14px] text-[#6a7282]">
                  <div className="flex items-center gap-2">
                    <img alt="" className="h-4 w-4" src={botIcon} />
                    {`Generated with ${botName}`}
                  </div>
                  <div>{messageCount} messages</div>
                </div>
                {statusMessage && (
                  <div className="border-t border-[#e5e7eb] px-8 py-3 text-[12px] text-[#6a7282]">
                    {statusMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="w-[384px] border-l border-[#e5e7eb] bg-[#f9fafb]">
          <div className="flex h-[57px] items-center justify-between border-b border-[#e5e7eb] bg-white px-4">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
              <img alt="" className="h-4 w-4" src={tabContext} />
              Context
            </div>
            <button type="button" className="flex h-8 w-9 items-center justify-center">
              <img alt="" className="h-4 w-4" src={panelClose} />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-4 pb-0 pt-4">
            <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-[25px] py-[25px]">
              <p className="text-[12px] leading-[16px] text-[#6a7282]">
                {`Add context to help ${botName} understand your product better`}
              </p>
              <div className="relative mt-4">
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                  onClick={() => {
                    if (!projects.length) {
                      setStatusMessage("Create a project to link this PRD.");
                      return;
                    }
                    setContextProjectMenuOpen((prev) => !prev);
                  }}
                >
                  <img alt="" className="h-4 w-4" src={projectIcon} />
                  <span className="whitespace-nowrap">{headerProjectLabel}</span>
                  <img alt="" className="ml-auto h-4 w-4" src={chevronDown} />
                </button>
                {contextProjectMenuOpen && (
                  <div className="absolute left-0 top-[42px] z-20 w-full rounded-[12px] border border-[#e5e7eb] bg-white p-2 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                        !activePrdProjectId ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                      }`}
                      onClick={() => {
                        setActivePrdProjectId(null);
                        setContextProjectMenuOpen(false);
                      }}
                    >
                      <span className="h-2 w-2 rounded-full bg-[#99a1af]" />
                      No Project
                    </button>
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                          activePrdProjectId === project.id ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                        }`}
                        onClick={() => {
                          if (!activePrdId) {
                            setActivePrdProjectId(project.id);
                            setContextProjectMenuOpen(false);
                            return;
                          }
                          setPendingProjectId(project.id);
                          setContextProjectMenuOpen(false);
                          setShowAttachModal(true);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full bg-[#ad46ff]" />
                        {project.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="relative h-8 w-full rounded-lg border border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a]"
                >
                  <img alt="" className="absolute left-2.5 top-[7px] h-4 w-4" src={uploadIcon} />
                  <span className="absolute left-[71px] top-[5px] -translate-x-1/2 text-[14px] font-medium tracking-[-0.1504px]">
                    Upload File
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canAddNote}
                  onClick={() => setShowNoteModal(true)}
                  className={`relative h-8 w-full rounded-lg border border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a] ${
                    canAddNote ? "" : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <img alt="" className="absolute left-2.5 top-[7px] h-4 w-4" src={noteIcon} />
                  <span className="absolute left-[65px] top-[5px] -translate-x-1/2 text-[14px] font-medium tracking-[-0.1504px]">
                    Add Note
                  </span>
                </button>
              </div>
            </div>
            {hasContext ? (
              <>
                {hasNotes && noteList}
                {hasFiles && fileList}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-start px-4 pt-8">
                <img alt="" className="h-8 w-8" src={emptyStateIcon} />
                <p className="mt-6 text-[14px] tracking-[-0.1504px] text-[#6a7282]">No context added yet</p>
              </div>
            )}
          </div>
        </aside>
      </div>
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[512px] rounded-[14px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                  <img alt="" className="h-5 w-5" src={docIcon} />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Save PRD</p>
                  <p className="text-[14px] text-[#6a7282]">Give your PRD a name</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowSaveModal(false)}
              >
                <img alt="" className="h-4 w-4" src={panelClose} />
              </button>
            </div>

            <div className="px-6 pt-6">
              <label className="text-[14px] font-medium text-[#364153]">
                PRD Title <span className="text-[#fb2c36]">*</span>
              </label>
              <input
                className="mt-2 h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="e.g., Mobile App Onboarding Redesign"
                value={saveTitle}
                onChange={(event) => setSaveTitle(event.target.value)}
              />

              <div className="mt-5">
                <div className="flex items-center gap-2 text-[14px] font-medium text-[#364153]">
                  <span>Project</span>
                  <span className="text-[12px] text-[#99a1af]">(optional)</span>
                </div>
                <div className="relative mt-2">
                  <button
                    type="button"
                    className={`flex h-[42px] w-full items-center justify-between rounded-[10px] border border-[#d1d5dc] bg-white px-[17px] text-[14px] text-[#364153] ${
                      canSelectProject ? "" : "cursor-not-allowed opacity-60"
                    }`}
                    onClick={() => {
                      if (!canSelectProject) return;
                      setProjectMenuOpen((prev) => !prev);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <img alt="" className="h-4 w-4" src={projectIcon} />
                      {selectedProjectLabel}
                    </span>
                    <img alt="" className="h-4 w-4" src={chevronDown} />
                  </button>
                  {projectMenuOpen && (
                    <div className="absolute left-0 right-0 top-[50px] z-10 rounded-[10px] border border-[#e5e7eb] bg-white p-1 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                          !activePrdProjectId ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                        }`}
                        onClick={() => {
                          setActivePrdProjectId(null);
                          setProjectMenuOpen(false);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full bg-[#99a1af]" />
                        No Project
                      </button>
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${
                            activePrdProjectId === project.id ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                          }`}
                          onClick={() => {
                            setActivePrdProjectId(project.id);
                            setProjectMenuOpen(false);
                          }}
                        >
                          <span className="h-2 w-2 rounded-full bg-[#ad46ff]" />
                          {project.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#e5e7eb] px-6 py-4">
              <button
                type="button"
                className="h-9 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-4 text-[14px] font-medium text-[#0a0a0a]"
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`h-9 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium text-white ${
                  saveTitle.trim() ? "opacity-100" : "opacity-50"
                }`}
                onClick={handleSave}
                disabled={!saveTitle.trim()}
              >
                Save PRD
              </button>
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
                  <img alt="" className="h-5 w-5" src={noteIcon} />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Add note</p>
                  <p className="text-[14px] text-[#6a7282]">Capture context to guide this PRD.</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowNoteModal(false)}
              >
                <img alt="" className="h-4 w-4" src={panelClose} />
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="text-[14px] font-medium text-[#364153]">Title</label>
              <input
                className="mt-2 h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="e.g., Target persona and goals"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
              />

              <label className="mt-4 block text-[14px] font-medium text-[#364153]">Note</label>
              <textarea
                className="mt-2 min-h-[140px] w-full resize-none rounded-[12px] border border-[#e5e7eb] px-3 py-2 text-[14px] text-[#101828] placeholder:text-[#99a1af]"
                placeholder="Add details that should influence the PRD..."
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value.slice(0, 1000))}
              />
              <div className="mt-2 flex items-center justify-between text-[12px] text-[#99a1af]">
                <span>{`Be specific so ${botName} can reuse this context.`}</span>
                <span>{noteContent.length}/1000</span>
              </div>

              <div className="mt-4 rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] p-3 text-[12px] text-[#6a7282]">
                <p className="font-medium text-[#4a5565]">Example notes</p>
                <p className="mt-1">Target persona: enterprise PMs managing multiple teams.</p>
                <p>Primary goal: reduce onboarding time by 30 percent.</p>
              </div>
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
                className="h-10 rounded-[10px] bg-[#6d28d9] px-5 text-[14px] font-semibold text-white"
                onClick={handleAddNote}
              >
                Add note
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
                  <img alt="" className="h-5 w-5" src={uploadIcon} />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Upload file</p>
                  <p className="text-[14px] text-[#6a7282]">Add reference docs to guide the PRD.</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowUploadModal(false)}
              >
                <img alt="" className="h-4 w-4" src={panelClose} />
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="text-[14px] font-medium text-[#364153]">Title</label>
              <input
                className="mt-2 h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="e.g., Research Brief or Competitive Analysis"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
              />

              <div className="mt-4 rounded-[16px] border border-dashed border-[#d4d4d8] bg-[#fafafa] px-4 py-6 text-center">
                <input
                  type="file"
                  className="hidden"
                  id="prd-context-upload"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file && !uploadTitle) {
                      setUploadTitle(file.name);
                    }
                  }}
                />
                <label
                  htmlFor="prd-context-upload"
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
      {showAttachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[520px] rounded-[16px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f4ebff]">
                  <img alt="" className="h-5 w-5" src={projectIcon} />
                </div>
                <div>
                  <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Add to project</p>
                  <p className="text-[14px] text-[#6a7282]">Link this PRD and move context into the project.</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                onClick={() => setShowAttachModal(false)}
              >
                <img alt="" className="h-4 w-4" src={panelClose} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-[14px] text-[#364153]">
                <p className="font-semibold text-[#101828]">
                  {projects.find((project) => project.id === pendingProjectId)?.title || "Selected project"}
                </p>
                <p className="mt-1 text-[13px] text-[#6a7282]">
                  This will attach the PRD and add {noteEntries.length} notes and {fileEntries.length} files to the
                  project’s knowledge.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#e5e7eb] px-6 py-4">
              <button
                type="button"
                className="h-10 rounded-[10px] border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#364153]"
                onClick={() => setShowAttachModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-[10px] bg-[#6d28d9] px-5 text-[14px] font-semibold text-white"
                onClick={handleAttachToProject}
              >
                Add to project
              </button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold text-[#101828] shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
