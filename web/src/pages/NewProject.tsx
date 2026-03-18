import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  createProject,
  createKnowledgeBaseEntry,
  getProject,
  uploadKnowledgeBaseEntry,
  projectBuilderBrief,
  projectBuilderChat,
  updateProject,
  type ProjectBuilderMessage,
  type ProjectBuilderResponse,
} from "../api";
import { useUserRole } from "../context/RoleContext";
import TypingIndicator from "../components/TypingIndicator";
import { getStoredAgentName } from "../utils/agentProfile";

type InlineIconName =
  | "back"
  | "header"
  | "save"
  | "assistant"
  | "send"
  | "preview"
  | "prd"
  | "task"
  | "check"
  | "ready"
  | "upload"
  | "note"
  | "empty";

function InlineIcon({ name, className }: { name: InlineIconName; className?: string }) {
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
          <rect x="3" y="4" width="14" height="12" rx="2" stroke="#7c3aed" strokeWidth="1.7" />
          <path d="M3 8h14" stroke="#7c3aed" strokeWidth="1.7" />
        </svg>
      );
    case "save":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M5 3.5h8l2 2V16H5V3.5Z" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 3.5v4h4v-4M8 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "assistant":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M5 5.5h10v7H8l-3 2v-9Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="8" cy="9" r="0.9" fill="white" />
          <circle cx="10" cy="9" r="0.9" fill="white" />
          <circle cx="12" cy="9" r="0.9" fill="white" />
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
          <rect x="3.5" y="4" width="13" height="12" rx="2" stroke="white" strokeWidth="1.6" />
          <path d="M6.5 12l2.5-2.5L11 11l2.5-2.5 2 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "prd":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2.5" width="12" height="15" rx="2" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M7 7h6M7 10h6M7 13h4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "task":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M7 10l2 2 4-4" stroke="#6b7280" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "check":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" fill="#16a34a" />
          <path d="M6.8 10.3l2.2 2.1 4.2-4.3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "ready":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" fill="#16a34a" />
          <path d="M7 10.3l2.2 2.2L13.5 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    default:
      return null;
  }
}

const COLOR_OPTIONS = [
  "#ad46ff",
  "#2b7fff",
  "#00c950",
  "#ff6900",
  "#f6339a",
  "#fb2c36",
  "#f0b100",
  "#615fff",
];

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const sentenceCase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
};

export default function NewProject() {
  const CHAT_SLOW_RESPONSE_MS = 15000;
  const navigate = useNavigate();
  const { workspaceId, projectId } = useParams<{ workspaceId?: string; projectId?: string }>();
  const { workspaceRole } = useUserRole();
  const botName = useMemo(() => getStoredAgentName(), []);
  const [inputValue, setInputValue] = useState("");
  const introMessage = useMemo(
    () =>
      projectId
        ? "You're editing this project. Tell me what you'd like to change or add, and I’ll update the details."
        : `Hi! I'm ${botName}. I'll help you create your project. Tell me about what you're building - the name, what it's about, goals, target users, or anything else that's important to capture.`,
    [projectId, botName]
  );
  const [messages, setMessages] = useState<ProjectBuilderMessage[]>([
    {
      role: "assistant",
      content: introMessage,
    },
  ]);
  const [attributes, setAttributes] = useState<Record<string, Record<string, unknown>>>({});
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error" | "info">("info");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [suggestedDescription, setSuggestedDescription] = useState<string | null>(null);
  const [isContextUpdating, setIsContextUpdating] = useState(false);
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  const [projectBrief, setProjectBrief] = useState<{ summary: string; bullets: string[] } | null>(null);
  const [briefAppliedSnapshot, setBriefAppliedSnapshot] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"name" | "description" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [contextEntries, setContextEntries] = useState<
    { id: string; title: string; content?: string | null; source_url?: string | null; type: "file" | "link" }[]
  >([]);
  const [noteText, setNoteText] = useState("");
  const [noteUrl, setNoteUrl] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"preview" | "context">("preview");
  const [showSlowResponseNotice, setShowSlowResponseNotice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const slowResponseTimerRef = useRef<number | null>(null);
  const lastChatPayloadRef = useRef<{
    messages: ProjectBuilderMessage[];
    attributes?: Record<string, Record<string, unknown>>;
  } | null>(null);
  const isEditMode = Boolean(projectId);
  const canEditWorkspace = workspaceRole === "admin" || workspaceRole === "editor";

  const clearSlowResponseTimer = () => {
    if (slowResponseTimerRef.current !== null) {
      window.clearTimeout(slowResponseTimerRef.current);
      slowResponseTimerRef.current = null;
    }
  };

  const getAttributeValue = (keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeKey(key);
      const entry = attributes[normalized];
      if (!entry) continue;
      const value = entry.value;
      if (Array.isArray(value)) return value.join(", ");
      if (value !== undefined && value !== null) return String(value);
    }
    return "";
  };

  const projectNameRaw = getAttributeValue(["project_name", "name", "title"]);
  const projectDescriptionRaw = getAttributeValue(["description", "about", "summary"]);
  const projectName = projectNameRaw ? sentenceCase(projectNameRaw) : "";
  const projectDescription = projectDescriptionRaw ? sentenceCase(projectDescriptionRaw) : "";
  const projectGoals = getAttributeValue(["goals", "goal", "objective", "objectives"]);
  const personasValue =
    attributes[normalizeKey("target_personas")]?.value ?? attributes[normalizeKey("target_users")]?.value;

  const parsedPersonas = useMemo(() => {
    if (!personasValue) return undefined;
    if (Array.isArray(personasValue)) {
      return personasValue.map((item) => String(item)).filter(Boolean);
    }
    if (typeof personasValue === "string") {
      return personasValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return undefined;
  }, [personasValue]);

  const canSave = Boolean(projectName && projectDescription);
  const baseAttributeKeys = new Set([
    normalizeKey("project_name"),
    normalizeKey("name"),
    normalizeKey("title"),
    normalizeKey("description"),
  ]);
  const extraAttributes = Object.entries(attributes).filter(
    ([key]) => !baseAttributeKeys.has(key) && key !== normalizeKey("color")
  );

  useEffect(() => {
    if (editingField !== "name") {
      setNameDraft(projectNameRaw);
    }
  }, [editingField, projectNameRaw]);

  useEffect(() => {
    if (editingField !== "description") {
      setDescriptionDraft(projectDescriptionRaw);
    }
  }, [editingField, projectDescriptionRaw]);

  useEffect(() => {
    if (!workspaceId || !projectId) return;
    let cancelled = false;
    const loadProject = async () => {
      setStatusMessage(null);
      try {
        const data = await getProject(projectId, workspaceId);
        if (cancelled) return;
        const payload = data?.project ?? {};
        const seededAttributes: Record<string, Record<string, unknown>> = {
          ...(payload.attributes || {}),
          project_name: { label: "Project Name", value: payload.title, source: "existing" },
          description: { label: "Description", value: payload.description, source: "existing" },
          goals: { label: "Goals", value: payload.goals, source: "existing" },
          target_personas: { label: "Target Personas", value: payload.target_personas, source: "existing" },
        };
        setAttributes(seededAttributes);
        if (payload.color) {
          setSelectedColor(payload.color);
        }
        setMessages((prev) => {
          if (prev.length === 0) {
            return [{ role: "assistant", content: introMessage }];
          }
          if (prev.length === 1 && prev[0].role === "assistant") {
            return [{ role: "assistant", content: introMessage }];
          }
          return prev;
        });
      } catch (error) {
        setStatusTone("error");
        setStatusMessage(error instanceof Error ? error.message : "Failed to load project.");
      }
    };
    loadProject();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, projectId, introMessage]);

  const runBuilderChat = async (
    payload: {
      messages: ProjectBuilderMessage[];
      attributes?: Record<string, Record<string, unknown>>;
    }
  ) => {
    if (!workspaceId) return;
    setIsSending(true);
    setShowSlowResponseNotice(false);
    clearSlowResponseTimer();
    slowResponseTimerRef.current = window.setTimeout(() => {
      setShowSlowResponseNotice(true);
      setStatusTone("info");
      setStatusMessage("Still working... You can keep waiting or retry.");
    }, CHAT_SLOW_RESPONSE_MS);
    const controller = new AbortController();
    chatAbortRef.current = controller;
    lastChatPayloadRef.current = payload;
    try {
      const response: ProjectBuilderResponse = await projectBuilderChat(workspaceId, payload, {
        signal: controller.signal,
      });
      if (response.attributes) {
        setAttributes(response.attributes);
      }
      setSuggestedDescription(response.suggested_description ?? null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.assistant_message,
        },
      ]);
      setShowSlowResponseNotice(false);
      setStatusMessage(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to reach ProjectBuilder.");
    } finally {
      clearSlowResponseTimer();
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isSending || !workspaceId) return;
    const newMessage: ProjectBuilderMessage = { role: "user", content: inputValue.trim() };
    setInputValue("");
    setStatusMessage(null);
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    await runBuilderChat({
      messages: updatedMessages,
      attributes,
    });
  };

  const handleRetryChat = async () => {
    if (!lastChatPayloadRef.current || !workspaceId) return;
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setStatusTone("info");
    setStatusMessage("Retrying...");
    await runBuilderChat(lastChatPayloadRef.current);
  };

  useEffect(() => {
    return () => {
      clearSlowResponseTimer();
      if (chatAbortRef.current) {
        chatAbortRef.current.abort();
        chatAbortRef.current = null;
      }
    };
  }, []);

  const applyContextToAttributes = async (label: string, content: string) => {
    if (!workspaceId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setIsContextUpdating(true);
    try {
      const response = await projectBuilderChat(workspaceId, {
        messages: [
          ...messages,
          {
            role: "user",
            content: `New context added (${label}): ${trimmed}`,
          },
        ],
        attributes,
      });
      if (response.attributes) {
        setAttributes(response.attributes);
      }
      setSuggestedDescription(response.suggested_description ?? null);
      setStatusTone("success");
      setStatusMessage("Context added to project.");
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to apply context.");
    } finally {
      setIsContextUpdating(false);
    }
  };

  const handleUploadContextFile = async (file: File) => {
    if (!workspaceId) {
      setStatusTone("error");
      setStatusMessage("Select a workspace to upload files.");
      return;
    }
    const data = new FormData();
    data.append("file", file);
    data.append("title", file.name);
    data.append("entry_type", "document");
    data.append("tags", "project_context");
    try {
      const entry = await uploadKnowledgeBaseEntry(workspaceId, data);
      setContextEntries((prev) => [
        {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          source_url: entry.source_url,
          type: "file",
        },
        ...prev,
      ]);
      await applyContextToAttributes(entry.title, entry.content || "");
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to upload file.");
    }
  };

  const handleAddNote = async () => {
    if (!workspaceId) {
      setStatusTone("error");
      setStatusMessage("Select a workspace to add notes.");
      return;
    }
    const trimmedNote = noteText.trim();
    const url = noteUrl.trim();
    if (!trimmedNote && !url) {
      setStatusTone("error");
      setStatusMessage("Add a note or link to save.");
      return;
    }
    const title = trimmedNote.split("\n")[0].slice(0, 60) || "Project note";
    try {
      const entry = await createKnowledgeBaseEntry(workspaceId, {
        type: "insight",
        title,
        content: trimmedNote || "Project context note.",
        source_url: url || undefined,
        tags: ["project_context"],
      });
      setContextEntries((prev) => [
        {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          source_url: entry.source_url,
          type: "link",
        },
        ...prev,
      ]);
      setNoteText("");
      setNoteUrl("");
      setShowNoteForm(false);
      await applyContextToAttributes(
        "Note",
        `${trimmedNote}${trimmedNote && url ? "\n" : ""}${url}`
      );
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to add note.");
    }
  };

  const handleGenerateBrief = async () => {
    if (!workspaceId) {
      setStatusTone("error");
      setStatusMessage("Select a workspace to generate a brief.");
      return;
    }
    setIsBriefLoading(true);
    try {
      const response = await projectBuilderBrief(workspaceId, {
        attributes,
        context_entries: contextEntries.map((entry) => ({
          title: entry.title,
          content: entry.content,
          source_url: entry.source_url,
        })),
      });
      setProjectBrief(response);
      const normalizedKey = normalizeKey("description");
      setBriefAppliedSnapshot(projectDescriptionRaw);
      setAttributes((prev) => ({
        ...prev,
        [normalizedKey]: {
          label: "Description",
          value: response.summary,
          source: "brief",
        },
      }));
      setStatusTone("success");
      setStatusMessage("Project brief applied to description.");
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to generate brief.");
    } finally {
      setIsBriefLoading(false);
    }
  };

  const handleUndoBrief = () => {
    if (briefAppliedSnapshot === null) return;
    const normalizedKey = normalizeKey("description");
    setAttributes((prev) => ({
      ...prev,
      [normalizedKey]: {
        label: "Description",
        value: briefAppliedSnapshot,
        source: "manual",
      },
    }));
    setBriefAppliedSnapshot(null);
    setStatusTone("info");
    setStatusMessage("Brief removed. Description restored.");
  };

  const handleSaveProject = async () => {
    if (!workspaceId) {
      setStatusTone("error");
      setStatusMessage("Select a workspace to save this project.");
      return;
    }
    if (isEditMode && !canEditWorkspace) {
      setStatusTone("error");
      setStatusMessage("You have read-only access to this workspace.");
      return;
    }
    if (isSaving) return;
    if (!canSave) {
      setStatusTone("error");
      setStatusMessage("Add a project name and description before saving.");
      return;
    }
    setIsSaving(true);
    setStatusTone("info");
    setStatusMessage("Saving project...");
    try {
      const payloadAttributes = {
        ...attributes,
        color: { label: "Color", value: selectedColor, source: "ui" },
      };
      const basePayload = {
        workspace_id: workspaceId,
        title: projectName || "Untitled Project",
        description: projectDescription || "Project description",
        goals: projectGoals || "Project goals",
        target_personas: parsedPersonas,
        color: selectedColor,
        attributes: payloadAttributes,
      };
      if (projectId) {
        await updateProject(projectId, basePayload);
      } else {
        await createProject(basePayload);
      }
      setStatusTone("success");
      setStatusMessage(projectId ? "Project updated." : "Project saved.");
      navigate(`/workspaces/${workspaceId}/projects`);
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to save project.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  return (
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
                    navigate(`/workspaces/${workspaceId}/projects`);
                    return;
                  }
                  navigate(-1);
                }}
              >
                <InlineIcon name="back" className="h-4 w-4" />
                Back
              </button>
              <div className="h-6 w-px bg-[#d1d5dc]" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f3e8ff]">
                  <InlineIcon name="header" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                    {isEditMode ? "Edit Project" : "Create New Project"}
                  </p>
                  <p className="text-[14px] text-[#6a7282]">Chat with AI to build your project</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[14px] font-medium tracking-[-0.1504px] text-white disabled:opacity-60"
              onClick={handleSaveProject}
              disabled={isSaving || (isEditMode && !canEditWorkspace)}
            >
              <span className="text-white">
                <InlineIcon name="save" className="h-4 w-4" />
              </span>
              {isSaving ? "Saving..." : isEditMode ? "Save Project" : "Save Project"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-81px)] overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col border-r border-[#e5e7eb]">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-8 pb-24">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
                  {!isUser && (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(43, 127, 255, 1) 100%)",
                      }}
                    >
                      <InlineIcon name="assistant" className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[650px] rounded-[16px] px-4 py-3 text-[14px] leading-[22.75px] ${
                      isUser ? "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white" : "bg-[#f3f4f6] text-[#101828]"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              );
            })}
            {isSending && (
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(43, 127, 255, 1) 100%)",
                  }}
                >
                  <InlineIcon name="assistant" className="h-4 w-4" />
                </div>
                <div className="max-w-[650px] rounded-[16px] border border-[#e5e7eb] bg-white px-4 py-3 text-[14px] leading-[22.75px] text-[#101828]">
                  <TypingIndicator label={botName} />
                </div>
              </div>
            )}
            {isSending && showSlowResponseNotice && (
              <div className="flex items-center gap-3 rounded-[12px] border border-[#d1d5dc] bg-white px-4 py-3">
                <p className="text-[13px] text-[#4a5565]">Still working on a response.</p>
                <button
                  type="button"
                  className="h-7 rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[12px] font-medium text-[#101828]"
                  onClick={handleRetryChat}
                >
                  Retry
                </button>
              </div>
            )}
            {statusMessage && statusTone === "error" && (
              <p className="text-sm text-[#fb2c36]">{statusMessage}</p>
            )}
          </div>
          <div className="sticky bottom-0 border-t border-[#e5e7eb] bg-white px-6 py-4">
            <div className="flex items-center gap-3">
              <input
                className="h-9 flex-1 rounded-[8px] bg-[#f3f3f5] px-4 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="Type your message..."
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
                className="flex h-9 w-10 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white disabled:opacity-50"
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending}
              >
                <InlineIcon name="send" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <aside className="w-[384px] shrink-0 bg-[#f9fafb]">
          <div className="flex h-full min-h-0 flex-col overflow-y-auto">
            <div className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-white px-4">
              <div className="flex h-[46px] items-center gap-1">
                <button
                  type="button"
                  className={`h-full border-b-2 px-3 text-[14px] font-medium ${
                    activeSideTab === "preview"
                      ? "border-[#9810fa] text-[#9810fa]"
                      : "border-transparent text-[#4a5565]"
                  }`}
                  onClick={() => setActiveSideTab("preview")}
                >
                  Live Preview
                </button>
                <button
                  type="button"
                  className={`h-full border-b-2 px-3 text-[14px] font-medium ${
                    activeSideTab === "context" ? "border-[#9810fa] text-[#9810fa]" : "border-transparent text-[#4a5565]"
                  }`}
                  onClick={() => setActiveSideTab("context")}
                >
                  Context
                </button>
              </div>
            </div>

            <div className="flex-1">
              {activeSideTab === "preview" ? (
                <div className="space-y-6 px-6 py-6">
                  <div>
                    <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">Live Preview</p>
                    <p className="text-[12px] text-[#6a7282]">See your project take shape in real-time</p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                      How it will look
                    </p>
                    <div className="rounded-[14px] border-2 border-[#e5e7eb] bg-white px-6 py-6">
                      <div className="flex gap-4">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-[10px]"
                          style={{ backgroundColor: selectedColor }}
                        >
                          <InlineIcon name="preview" className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">
                            {projectName || "Project name"}
                          </p>
                          <p className="text-[14px] text-[#4a5565]">{projectGoals || "Project goals"}</p>
                          <div className="mt-2 flex gap-4 text-[12px] text-[#6a7282]">
                            <div className="flex items-center gap-1">
                              <InlineIcon name="prd" className="h-3.5 w-3.5" />
                              0 PRDs
                            </div>
                            <div className="flex items-center gap-1">
                              <InlineIcon name="task" className="h-3.5 w-3.5" />
                              0 Tasks
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-[rgba(0,0,0,0.1)] bg-white px-5 py-5">
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                          Project Name
                          <div className="flex items-center gap-2">
                            {projectName ? <InlineIcon name="check" className="h-4 w-4" /> : null}
                            {editingField !== "name" && (
                              <button
                                type="button"
                                className="text-[11px] font-medium text-[#4a5565]"
                                onClick={() => setEditingField("name")}
                                disabled={isEditMode && !canEditWorkspace}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                        {editingField === "name" ? (
                          <div className="mt-2 space-y-2">
                            <input
                              className="h-9 w-full rounded-[8px] border border-[#e5e7eb] bg-white px-3 text-[14px] font-medium text-[#101828] placeholder:text-[#9aa3af]"
                              placeholder="Enter project name"
                              value={nameDraft}
                              disabled={isEditMode && !canEditWorkspace}
                              onChange={(event) => setNameDraft(event.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="h-7 rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[12px] font-medium text-[#101828]"
                                onClick={() => {
                                  setEditingField(null);
                                  setNameDraft(projectNameRaw);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="h-7 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[12px] font-medium text-white"
                                onClick={() => {
                                  const normalizedKey = normalizeKey("project_name");
                                  setAttributes((prev) => ({
                                    ...prev,
                                    [normalizedKey]: {
                                      label: "Project Name",
                                      value: nameDraft,
                                      source: "manual",
                                    },
                                  }));
                                  setEditingField(null);
                                }}
                                disabled={isEditMode && !canEditWorkspace}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-[14px] font-medium text-[#101828]">
                            {projectName || "Not set"}
                          </p>
                        )}
                      </div>
                      <div className="border-t border-[#e5e7eb] pt-4">
                        <div className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                          Description
                          <div className="flex items-center gap-2">
                            {projectDescription ? <InlineIcon name="check" className="h-4 w-4" /> : null}
                            {briefAppliedSnapshot !== null && (
                              <button
                                type="button"
                                className="text-[11px] font-medium text-[#4a5565]"
                                onClick={handleUndoBrief}
                              >
                                Undo brief
                              </button>
                            )}
                            {editingField !== "description" && (
                              <button
                                type="button"
                                className="text-[11px] font-medium text-[#4a5565]"
                                onClick={() => setEditingField("description")}
                                disabled={isEditMode && !canEditWorkspace}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                        {editingField === "description" ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              className="w-full resize-none rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-[14px] text-[#364153] placeholder:text-[#9aa3af]"
                              placeholder="Enter project description"
                              rows={4}
                              value={descriptionDraft}
                              disabled={isEditMode && !canEditWorkspace}
                              onChange={(event) => setDescriptionDraft(event.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="h-7 rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[12px] font-medium text-[#101828]"
                                onClick={() => {
                                  setEditingField(null);
                                  setDescriptionDraft(projectDescriptionRaw);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="h-7 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[12px] font-medium text-white"
                                onClick={() => {
                                  const normalizedKey = normalizeKey("description");
                                  setAttributes((prev) => ({
                                    ...prev,
                                    [normalizedKey]: {
                                      label: "Description",
                                      value: descriptionDraft,
                                      source: "manual",
                                    },
                                  }));
                                  setBriefAppliedSnapshot(null);
                                  setEditingField(null);
                                }}
                                disabled={isEditMode && !canEditWorkspace}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-[14px] text-[#364153]">
                            {projectDescription || "Not set"}
                          </p>
                        )}
                        {suggestedDescription && (
                          <div className="mt-4 rounded-[12px] border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6a7282]">
                              Suggested description
                            </p>
                            <p className="mt-2 text-[13px] text-[#1f2937]">{suggestedDescription}</p>
                            <button
                              type="button"
                              className="mt-3 inline-flex h-8 items-center rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[13px] font-medium text-[#101828]"
                              onClick={() => {
                                const normalizedKey = normalizeKey("description");
                                setAttributes((prev) => ({
                                  ...prev,
                                  [normalizedKey]: {
                                    label: "Description",
                                    value: suggestedDescription,
                                    source: "suggestion",
                                  },
                                }));
                                setBriefAppliedSnapshot(null);
                                setSuggestedDescription(null);
                              }}
                              disabled={isEditMode && !canEditWorkspace}
                            >
                              Use suggestion
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-[#e5e7eb] pt-4">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">Color</p>
                        <div className="mt-3 flex items-center gap-2">
                          {COLOR_OPTIONS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`h-7 w-7 rounded-[6px] ${
                                selectedColor === color
                                  ? "ring-2 ring-white ring-offset-2 ring-offset-[#ad46ff]"
                                  : "opacity-70"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => setSelectedColor(color)}
                              disabled={isEditMode && !canEditWorkspace}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-[#e5e7eb] pt-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                            Project brief
                          </p>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center rounded-[8px] border border-[#d1d5dc] bg-white px-2 text-[11px] font-medium text-[#101828]"
                            onClick={handleGenerateBrief}
                            disabled={isBriefLoading || (isEditMode && !canEditWorkspace)}
                          >
                            {isBriefLoading ? "Generating..." : "Generate"}
                          </button>
                        </div>
                        {projectBrief ? (
                          <div className="mt-3 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3">
                            <p className="text-[13px] text-[#1f2937]">{projectBrief.summary}</p>
                            {projectBrief.bullets.length > 0 && (
                              <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px] text-[#4b5563]">
                                {projectBrief.bullets.map((bullet) => (
                                  <li key={bullet}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-3 text-[12px] text-[#6a7282]">
                              The brief is applied to your description. You can edit it or undo above.
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-[#6a7282]">
                            Generate a concise brief from your project details and context.
                          </p>
                        )}
                      </div>
                      {extraAttributes.length > 0 && (
                        <div className="border-t border-[#e5e7eb] pt-4">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                            Additional Details
                          </p>
                          <div className="mt-3 space-y-3">
                            {extraAttributes.map(([key, payload]) => {
                              const label = (payload.label as string) || key.replace(/_/g, " ");
                              const value = payload.value;
                              const displayValue = Array.isArray(value)
                                ? value.join(", ")
                                : value !== undefined && value !== null
                                  ? String(value)
                                  : "Not set";
                              return (
                                <div key={key} className="border-t border-[#e5e7eb] pt-3 first:border-t-0 first:pt-0">
                                  <p className="text-[12px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                                    {label}
                                  </p>
                                  <p className="mt-2 text-[14px] text-[#364153]">{displayValue}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[14px] border border-[#b9f8cf] bg-[#f0fdf4] px-5 py-5">
                    <div className="flex items-start gap-3">
                      <InlineIcon name="ready" className="mt-0.5 h-5 w-5" />
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-[#0d542b]">Ready to Save!</p>
                        <p className="text-[12px] text-[#008236]">
                          {canSave ? "Your project has all the required details." : "Add a name and description to save."}
                        </p>
                        <button
                          type="button"
                          className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-60"
                          onClick={handleSaveProject}
                          disabled={isSaving || (isEditMode && !canEditWorkspace)}
                        >
                          <span className="text-white">
                            <InlineIcon name="save" className="h-4 w-4" />
                          </span>
                          Save Project Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="border-b border-[#e5e7eb] bg-white px-4 py-4">
                    <p className="text-[12px] text-[#6a7282]">Add context to help organize your project</p>
                    <div className="mt-4 space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleUploadContextFile(file);
                            event.target.value = "";
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isContextUpdating || (isEditMode && !canEditWorkspace)}
                      >
                        <InlineIcon name="upload" className="h-4 w-4" />
                        Upload File
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                        onClick={() => setShowNoteForm((prev) => !prev)}
                        disabled={isContextUpdating || (isEditMode && !canEditWorkspace)}
                      >
                        <InlineIcon name="note" className="h-4 w-4" />
                        Add Note
                      </button>
                      {showNoteForm && (
                        <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-3">
                          <textarea
                            className="w-full resize-none text-[13px] text-[#101828] placeholder:text-[#9aa3af] outline-none"
                            rows={3}
                            placeholder="Write a note about this project..."
                            value={noteText}
                            disabled={isEditMode && !canEditWorkspace}
                            onChange={(event) => setNoteText(event.target.value)}
                          />
                          <input
                            className="mt-2 w-full text-[12px] text-[#4b5563] placeholder:text-[#9aa3af] outline-none"
                            placeholder="Optional link"
                            value={noteUrl}
                            disabled={isEditMode && !canEditWorkspace}
                            onChange={(event) => setNoteUrl(event.target.value)}
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              className="h-7 rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[12px] font-medium text-[#101828]"
                              onClick={() => setShowNoteForm(false)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="h-7 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[12px] font-medium text-white"
                              onClick={handleAddNote}
                              disabled={isContextUpdating || (isEditMode && !canEditWorkspace)}
                            >
                              Save Note
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 px-4 py-4">
                    {contextEntries.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <InlineIcon name="empty" className="h-8 w-8" />
                        <p className="mt-3 text-[14px] text-[#6a7282]">No context added yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {contextEntries.map((entry) => (
                          <div key={entry.id} className="rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2">
                            <p className="text-[13px] font-medium text-[#101828]">{entry.title}</p>
                            {entry.source_url && (
                              <p className="mt-1 text-[11px] text-[#6a7282]">{entry.source_url}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
      {statusMessage && statusTone !== "error" && (
        <div className="fixed left-1/2 top-6 z-[80] -translate-x-1/2">
          <div
            className={`rounded-[10px] px-4 py-3 text-[14px] font-medium shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] ${
              statusTone === "success" ? "bg-[#16a34a] text-white" : "bg-[#0f172a] text-white"
            }`}
          >
            {statusMessage}
          </div>
        </div>
      )}
    </div>
  );
}
