import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SURFACE_CARD, SURFACE_MUTED, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../styles/theme";
import type {
  WorkspaceAgent,
  KnowledgeBaseContextItem,
  PRDRecord,
  TaskPriority,
  TaskStatus,
} from "../api";
import { runWorkspaceAgent, getProjects, getPrds, createDecisionNote, createTask } from "../api";
import { USER_ID_KEY } from "../constants";
import TypingIndicator from "./TypingIndicator";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  context?: KnowledgeBaseContextItem[];
};

type AgentChatPanelProps = {
  agent: WorkspaceAgent | null;
  workspaceId: string | null;
  projectId?: string | null;
};

type ProjectSummary = {
  id: string;
  title: string;
};

type DecisionActionDraft = {
  type: "decision";
  message: ChatMessage;
  projectId: string;
  prdId: string;
  decision: string;
  rationale: string;
  version: string;
};

type TaskActionDraft = {
  type: "task";
  message: ChatMessage;
  projectId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
};

type ActionDraft = DecisionActionDraft | TaskActionDraft;

type ActionAlert = {
  text: string;
  href?: string;
  label?: string;
};

export default function AgentChatPanel({ agent, workspaceId, projectId }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [prdsByProject, setPrdsByProject] = useState<Record<string, PRDRecord[]>>({});
  const [prdsLoading, setPrdsLoading] = useState<string | null>(null);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionAlert, setActionAlert] = useState<ActionAlert | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setProjectsLoading(true);
    getProjects(workspaceId, userId ?? undefined)
      .then((data: { projects?: ProjectSummary[] }) => {
        if (cancelled) return;
        setProjects(data.projects || []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setActionError((prev) => prev ?? (err.message || "Failed to load projects"));
      })
      .finally(() => {
        if (cancelled) return;
        setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!actionDraft || actionDraft.type !== "decision" || !actionDraft.projectId) return;
    if (prdsByProject[actionDraft.projectId]) return;
    let cancelled = false;
    setPrdsLoading(actionDraft.projectId);
    getPrds(actionDraft.projectId, workspaceId)
      .then((records) => {
        if (cancelled) return;
        setPrdsByProject((prev) => ({ ...prev, [actionDraft.projectId]: records }));
      })
      .catch((err: any) => {
        if (cancelled) return;
        setActionError(err.message || "Failed to load PRDs");
      })
      .finally(() => {
        if (cancelled) return;
        setPrdsLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [actionDraft, workspaceId, prdsByProject]);

  useEffect(() => {
    if (!actionAlert) return;
    const timer = setTimeout(() => setActionAlert(null), 4000);
    return () => clearTimeout(timer);
  }, [actionAlert]);

  const buildProjectLink = (
    targetProjectId?: string | null,
    options?: { tab?: string; prdId?: string; section?: string }
  ) => {
    if (!workspaceId) return undefined;
    if (!targetProjectId) return `/workspaces/${workspaceId}/projects`;
    const tabSuffix = options?.tab ? `/${options.tab}` : "";
    const base = `/workspaces/${workspaceId}/projects/detail/${targetProjectId}${tabSuffix}`;
    const params = new URLSearchParams();
    if (options?.prdId) params.set("focus_prd", options.prdId);
    if (options?.section) params.set("focus_section", options.section);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !agent || !prompt.trim()) {
      setError("Provide a prompt and select an agent.");
      return;
    }
    const userMsg: ChatMessage = { role: "user", content: prompt.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setLoading(true);
    setError(null);
    try {
      const response = await runWorkspaceAgent(workspaceId, agent.id, {
        prompt: userMsg.content,
        project_id: projectId ?? undefined,
      });
      const reply: ChatMessage = {
        role: "assistant",
        content: response.response,
        context: response.context_used,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setError(err.message || "Agent failed to respond.");
    } finally {
      setLoading(false);
    }
  };

  const startDecisionComposer = (message: ChatMessage) => {
    setActionAlert(null);
    setActionError(null);
    setActionDraft({
      type: "decision",
      message,
      projectId: "",
      prdId: "",
      decision: message.content,
      rationale: "",
      version: "",
    });
  };

  const startTaskComposer = (message: ChatMessage) => {
    const headline = message.content.split("\n")[0]?.slice(0, 80) || "Follow-up task";
    setActionAlert(null);
    setActionError(null);
    setActionDraft({
      type: "task",
      message,
      projectId: "",
      title: headline,
      description: message.content,
      priority: "high",
      status: "todo",
    });
  };

  const cancelActionDraft = () => {
    setActionDraft(null);
    setActionError(null);
  };

  const handleDecisionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !actionDraft || actionDraft.type !== "decision") return;
    if (!actionDraft.projectId || !actionDraft.prdId || !actionDraft.decision.trim()) {
      setActionError("Select a project + PRD and add a decision summary.");
      return;
    }
    setActionSaving(true);
    try {
      await createDecisionNote(actionDraft.projectId, actionDraft.prdId, workspaceId, {
        decision: actionDraft.decision.trim(),
        rationale: actionDraft.rationale.trim() || null,
        version: actionDraft.version ? Number(actionDraft.version) : undefined,
      });
      setActionAlert({
        text: "Decision note logged",
        href: buildProjectLink(actionDraft.projectId, {
          tab: "prd",
          prdId: actionDraft.prdId,
          section: "decision",
        }),
        label: "View decision log",
      });
      setActionDraft(null);
      setActionError(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to log decision note");
    } finally {
      setActionSaving(false);
    }
  };

  const handleTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !actionDraft || actionDraft.type !== "task") return;
    if (!actionDraft.title.trim()) {
      setActionError("Task title is required.");
      return;
    }
    if (!userId) {
      setActionError("Sign in again to create tasks.");
      return;
    }
    setActionSaving(true);
    try {
      await createTask(workspaceId, userId, {
        project_id: actionDraft.projectId || null,
        title: actionDraft.title.trim(),
        description: actionDraft.description.trim() || null,
        priority: actionDraft.priority,
        status: actionDraft.status,
      });
      setActionAlert({
        text: "Follow-up task created",
        href: buildProjectLink(actionDraft.projectId, { tab: "tasks" }),
        label: "Open board",
      });
      setActionDraft(null);
      setActionError(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to create task");
    } finally {
      setActionSaving(false);
    }
  };

  const renderDecisionComposer = () => {
    if (!actionDraft || actionDraft.type !== "decision") return null;
    const prds = actionDraft.projectId ? prdsByProject[actionDraft.projectId] || [] : [];
    const snippet = actionDraft.message.content.length > 200
      ? `${actionDraft.message.content.slice(0, 200)}…`
      : actionDraft.message.content;
    return (
      <form onSubmit={handleDecisionSubmit} className="space-y-3 text-sm text-slate-700">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Source excerpt</p>
          <p className="text-xs text-slate-500">“{snippet}”</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Project
            <select
              value={actionDraft.projectId}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "decision"
                    ? { ...prev, projectId: event.target.value, prdId: "" }
                    : prev
                )
              }
              className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">{projectsLoading ? "Loading projects…" : "Select project"}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            PRD
            <select
              value={actionDraft.prdId}
              disabled={!actionDraft.projectId || !!prdsLoading}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "decision" ? { ...prev, prdId: event.target.value } : prev
                )
              }
              className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
            >
              <option value="">
                {!actionDraft.projectId
                  ? "Pick a project first"
                  : prdsLoading === actionDraft.projectId
                  ? "Loading PRDs…"
                  : prds.length > 0
                  ? "Select PRD"
                  : "No PRDs found"}
              </option>
              {prds.map((prd) => (
                <option key={prd.id} value={prd.id}>
                  {prd.feature_name || prd.description || prd.id.slice(0, 6)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Decision summary
            <textarea
              value={actionDraft.decision}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "decision" ? { ...prev, decision: event.target.value } : prev
                )
              }
              rows={2}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Rationale (optional)
            <textarea
              value={actionDraft.rationale}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "decision" ? { ...prev, rationale: event.target.value } : prev
                )
              }
              rows={2}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          Version (optional)
          <input
            type="number"
            min="1"
            value={actionDraft.version}
            onChange={(event) =>
              setActionDraft((prev) =>
                prev && prev.type === "decision" ? { ...prev, version: event.target.value } : prev
              )
            }
            className="mt-1 w-32 rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className={SECONDARY_BUTTON} onClick={cancelActionDraft}>
            Cancel
          </button>
          <button
            type="submit"
            className={PRIMARY_BUTTON}
            disabled={actionSaving || !actionDraft.projectId || !actionDraft.prdId || !actionDraft.decision.trim()}
          >
            {actionSaving ? "Logging…" : "Log decision note"}
          </button>
        </div>
      </form>
    );
  };

  const renderTaskComposer = () => {
    if (!actionDraft || actionDraft.type !== "task") return null;
    const snippet = actionDraft.message.content.length > 200
      ? `${actionDraft.message.content.slice(0, 200)}…`
      : actionDraft.message.content;
    return (
      <form onSubmit={handleTaskSubmit} className="space-y-3 text-sm text-slate-700">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Source excerpt</p>
          <p className="text-xs text-slate-500">“{snippet}”</p>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          Project (optional)
          <select
            value={actionDraft.projectId}
            onChange={(event) =>
              setActionDraft((prev) =>
                prev && prev.type === "task" ? { ...prev, projectId: event.target.value } : prev
              )
            }
            className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">{projectsLoading ? "Loading projects…" : "No project"}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Task title
          <input
            value={actionDraft.title}
            onChange={(event) =>
              setActionDraft((prev) =>
                prev && prev.type === "task" ? { ...prev, title: event.target.value } : prev
              )
            }
            className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Priority
            <select
              value={actionDraft.priority}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "task"
                    ? { ...prev, priority: event.target.value as TaskPriority }
                    : prev
                )
              }
              className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Status
            <select
              value={actionDraft.status}
              onChange={(event) =>
                setActionDraft((prev) =>
                  prev && prev.type === "task"
                    ? { ...prev, status: event.target.value as TaskStatus }
                    : prev
                )
              }
              className="mt-1 w-full rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="todo">To-do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          Details (optional)
          <textarea
            value={actionDraft.description}
            onChange={(event) =>
              setActionDraft((prev) =>
                prev && prev.type === "task" ? { ...prev, description: event.target.value } : prev
              )
            }
            rows={3}
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className={SECONDARY_BUTTON} onClick={cancelActionDraft}>
            Cancel
          </button>
          <button type="submit" className={PRIMARY_BUTTON} disabled={actionSaving || !actionDraft.title.trim()}>
            {actionSaving ? "Creating…" : "Create follow-up task"}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className={`${SURFACE_CARD} flex h-full flex-col`}>
      <header className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">
          {agent ? `Chat with ${agent.name}` : "Select an agent to chat"}
        </p>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={`${message.role}-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`${SURFACE_MUTED} ${message.role === "assistant" ? "bg-white" : ""}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {message.role === "assistant" ? agent?.name ?? "Agent" : "You"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{message.content}</p>
              {message.context && message.context.length > 0 && (
                <div className="mt-2 rounded-2xl bg-slate-50 p-2 text-xs text-slate-500">
                  <p className="font-semibold text-slate-600">Context</p>
                  <ul className="mt-1 space-y-1">
                    {message.context.map((entry) => (
                      <li key={`${entry.id}-${entry.marker}`}>
                        <span className="font-semibold text-blue-600">{entry.marker}:</span> {entry.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {message.role === "assistant" && agent && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  {agent.tools?.canCreateDecisionNote && (
                    <button
                      type="button"
                      onClick={() => startDecisionComposer(message)}
                      className="text-blue-600 transition hover:text-blue-800"
                    >
                      Capture as decision note
                    </button>
                  )}
                  {agent.tools?.canDraftTask && (
                    <button
                      type="button"
                      onClick={() => startTaskComposer(message)}
                      className="text-blue-600 transition hover:text-blue-800"
                    >
                      Create follow-up task
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && agent && (
          <div className={`${SURFACE_MUTED} bg-white`}>
            <TypingIndicator label={agent.name} />
          </div>
        )}
        {messages.length === 0 && (
          <p className="text-xs text-slate-500">Send a prompt to see how your agent responds.</p>
        )}
      </div>
      {actionDraft && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {actionDraft.type === "decision" ? "Log decision" : "Follow-up task"}
          </div>
          {actionDraft.type === "decision" ? renderDecisionComposer() : renderTaskComposer()}
        </div>
      )}
      {actionError && !actionDraft && (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{actionError}</div>
      )}
      {actionAlert && (
        <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          <span>{actionAlert.text}</span>
          {actionAlert.href && (
            <a
              href={actionAlert.href}
              className="ml-3 font-semibold text-emerald-900 underline decoration-emerald-600"
            >
              {actionAlert.label || "Open"}
            </a>
          )}
        </div>
      )}
      <form onSubmit={handleSend} className="border-t border-slate-200 px-4 py-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask your agent to summarize the roadmap, draft a PRD section, etc."
          rows={3}
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <div className="mt-2 flex justify-end">
          <button type="submit" disabled={loading || !agent} className={PRIMARY_BUTTON}>
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
