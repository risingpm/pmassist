import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  askWorkspaceQuestion,
  fetchRoadmap,
  getWorkspaceChatSession,
  getProjects,
  getPrds,
  listWorkspaceChatSessions,
  listTaskBoards,
  type PRDRecord,
  type WorkspaceChatSessionSummary,
  type TaskBoardRecord,
  type WorkspaceChatMessage,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY } from "../constants";

type ProjectContextItem = {
  id: string;
  title: string;
  description?: string | null;
  prd_count?: number | null;
  task_count?: number | null;
  color?: string | null;
};

const PROJECT_COLORS = ["#ad46ff", "#2b7fff", "#00c950", "#ff6900", "#615fff", "#f6339a"];
const DEFAULT_WELCOME =
  "Hi! I'm your AI assistant. I can help with product tasks, brainstorm ideas, and answer questions. Select a project from the right panel for context-aware help, or start chatting directly.";

function getProjectWelcome(projectName: string) {
  return `Hi! I'm your AI assistant for the ${projectName} project. I have access to all your project context including PRDs, roadmaps, and tasks. How can I help you today?`;
}

function IconBack() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 6.6V10l2.4 1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPanel() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3.8v12.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="m11.8 10 2-2m-2 2 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="12" rx="3" stroke="white" strokeWidth="1.6" />
      <path d="m7 17 2.5-2h4.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2 8 13.5 2.5 10 13.5 7.8 9.7 2 8Z" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconClip() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M7.2 10.8 11.9 6a3 3 0 1 1 4.2 4.2l-6.4 6.4a4.5 4.5 0 0 1-6.4-6.4L9.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 16 16" fill="none">
      <rect x="6" y="6" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function formatHistoryDate(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

export default function AIChatPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WorkspaceChatMessage[]>([
    {
      role: "assistant",
      content: DEFAULT_WELCOME,
      created_at: new Date().toISOString(),
    },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectContextItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectPrds, setProjectPrds] = useState<PRDRecord[]>([]);
  const [projectRoadmap, setProjectRoadmap] = useState<{ title: string; updated_at?: string | null } | null>(null);
  const [projectBoards, setProjectBoards] = useState<TaskBoardRecord[]>([]);
  const [projectContextLoading, setProjectContextLoading] = useState(false);
  const [projectContextError, setProjectContextError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<WorkspaceChatSessionSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (!auth) {
      navigate("/signin", { replace: true });
      return;
    }
    setUserId(window.sessionStorage.getItem(USER_ID_KEY));
  }, [navigate]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    getProjects(workspaceId, userId)
      .then((response: { projects?: ProjectContextItem[] }) => setProjects(response.projects || []))
      .catch(() => setProjects([]));
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    let cancelled = false;
    setLoadingHistory(true);
    listWorkspaceChatSessions(workspaceId, userId)
      .then((items) => {
        if (cancelled) return;
        setChatHistory(items);
      })
      .catch(() => {
        if (cancelled) return;
        setChatHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId, sessionId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (!workspaceId || !userId || !selectedProjectId) {
      setProjectPrds([]);
      setProjectRoadmap(null);
      setProjectBoards([]);
      setProjectContextError(null);
      setProjectContextLoading(false);
      return;
    }
    let cancelled = false;
    setProjectContextLoading(true);
    setProjectContextError(null);
    Promise.allSettled([
      getPrds(selectedProjectId, workspaceId),
      fetchRoadmap(selectedProjectId, workspaceId),
      listTaskBoards(workspaceId, userId, selectedProjectId),
    ])
      .then((results) => {
        if (cancelled) return;
        const [prdsResult, roadmapResult, boardsResult] = results;

        if (prdsResult.status === "fulfilled") {
          setProjectPrds(prdsResult.value);
        } else {
          setProjectPrds([]);
        }

        if (roadmapResult.status === "fulfilled") {
          const data = roadmapResult.value as { title?: string; updated_at?: string; content?: string | null };
          if (data?.content?.trim()) {
            setProjectRoadmap({
              title: data.title || `${selectedProject?.title || "Project"} roadmap`,
              updated_at: data.updated_at,
            });
          } else {
            setProjectRoadmap(null);
          }
        } else {
          setProjectRoadmap(null);
        }

        if (boardsResult.status === "fulfilled") {
          setProjectBoards(boardsResult.value);
        } else {
          setProjectBoards([]);
        }

        const prdsFailed = prdsResult.status === "rejected";
        const boardsFailed = boardsResult.status === "rejected";
        const roadmapFailed = roadmapResult.status === "rejected";

        // Roadmap endpoint returns 404 when no roadmap exists; treat that as empty state.
        if (prdsFailed || boardsFailed) {
          setProjectContextError("Some project context could not be loaded.");
        } else if (roadmapFailed) {
          setProjectContextError(null);
        } else {
          setProjectContextError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProjectPrds([]);
        setProjectRoadmap(null);
        setProjectBoards([]);
        setProjectContextError("Failed to load project context.");
      })
      .finally(() => {
        if (!cancelled) setProjectContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId, selectedProjectId, selectedProject?.title]);

  useEffect(() => {
    if (!selectedProject || sessionId || messages.length !== 1 || messages[0].role !== "assistant") return;
    const projectWelcome = getProjectWelcome(selectedProject.title);
    if (messages[0].content === projectWelcome) return;
    setMessages([
      {
        role: "assistant",
        content: projectWelcome,
        created_at: new Date().toISOString(),
      },
    ]);
  }, [selectedProject, sessionId, messages]);

  const handleSend = async () => {
    if (!workspaceId || !userId || !input.trim() || sending) return;
    const baseQuestion = input.trim();
    const question = selectedProject
      ? `Project Context: ${selectedProject.title}\n${baseQuestion}`
      : baseQuestion;
    setSending(true);
    setError(null);
    try {
      const response = await askWorkspaceQuestion({
        workspace_id: workspaceId,
        user_id: userId,
        question,
        session_id: sessionId,
      });
      setSessionId(response.session_id);
      setMessages(response.messages);
      setInput("");
      if (workspaceId && userId) {
        listWorkspaceChatSessions(workspaceId, userId).then(setChatHistory).catch(() => undefined);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleNewChat = () => {
    const hasConversation = Boolean(
      sessionId || messages.some((msg) => msg.role === "user") || messages.length > 1
    );
    if (!hasConversation) return;
    setSessionId(null);
    setError(null);
    setMessages([
      {
        role: "assistant",
        content: selectedProject ? getProjectWelcome(selectedProject.title) : DEFAULT_WELCOME,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput("");
  };

  const handleSelectSession = async (targetSessionId: string) => {
    if (!workspaceId || !userId) return;
    try {
      const data = await getWorkspaceChatSession(targetSessionId, workspaceId, userId);
      setSessionId(data.session_id);
      setMessages(data.messages);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load chat session.");
    }
  };

  const quickPrompts = [
    "Show project overview",
    "List all PRDs",
    "What tasks are pending?",
    "Create a new PRD",
  ];

  const projectContextCount = projectPrds.length + (projectRoadmap ? 1 : 0) + projectBoards.length;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="border-b border-[#e5e7eb] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#0a0a0a]"
              onClick={() => {
                if (workspaceId) {
                  navigate(`/workspaces/${workspaceId}/home`);
                  return;
                }
                navigate(-1);
              }}
            >
              <IconBack />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#0a0a0a]"
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              {historyOpen ? <IconPanel /> : <IconHistory />}
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                <IconChat />
              </div>
              <div>
                <h1 className="text-[18px] font-semibold tracking-[-0.44px] text-[#101828]">
                  {selectedProject?.title || "AI Chat"}
                </h1>
                <p className="text-[12px] text-[#6a7282]">{selectedProject ? "Project Chat" : "General Assistant"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-8 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
              onClick={handleNewChat}
            >
              + New Chat
            </button>
            {selectedProject ? (
              <button
                type="button"
                className="h-8 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
              >
                Context ({projectContextCount})
              </button>
            ) : null}
            <p
              className="text-[30px] font-bold tracking-[0.39px]"
              style={{
                WebkitTextFillColor: "transparent",
                backgroundImage: "linear-gradient(90deg, rgba(152, 16, 250, 1) 0%, rgba(21, 93, 252, 1) 100%)",
                backgroundClip: "text",
              }}
            >
              8product.ai
            </p>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-77px)]">
        {historyOpen ? (
          <aside className="w-[256px] border-r border-[#e5e7eb] bg-[#f9fafb]">
            <div className="border-b border-[#e5e7eb] bg-white px-4 py-4">
              <h3 className="text-[18px] font-semibold leading-[27px] tracking-[-0.44px] text-[#101828]">Chat History</h3>
              <p className="text-[12px] text-[#6a7282]">
                {chatHistory.length} conversation{chatHistory.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="h-[calc(100vh-157px)] overflow-y-auto p-3">
              {loadingHistory ? <p className="px-1 text-[12px] text-[#6a7282]">Loading...</p> : null}
              <div className="space-y-2">
                {chatHistory.map((session) => {
                  const active = sessionId === session.session_id;
                  return (
                    <button
                      key={session.session_id}
                      type="button"
                      onClick={() => void handleSelectSession(session.session_id)}
                      className={`w-full rounded-[10px] border bg-white px-3 py-3 text-left ${
                        active ? "border-[#9810fa]" : "border-[#e5e7eb]"
                      }`}
                    >
                      <p className="truncate text-[14px] font-medium leading-[20px] tracking-[-0.15px] text-[#101828]">
                        {session.preview}
                      </p>
                      <p className="mt-1 text-[12px] text-[#6a7282]">{formatHistoryDate(session.updated_at)}</p>
                    </button>
                  );
                })}
                {!loadingHistory && chatHistory.length === 0 ? (
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3 text-[12px] text-[#6a7282]">
                    No conversations yet.
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}

        <section className="relative flex min-w-0 flex-1 flex-col border-r border-[#e5e7eb]">
          <div className="flex-1 overflow-y-auto px-6 py-6 pb-28">
            <div className="space-y-5">
              {messages.map((message, index) => {
                const assistant = message.role === "assistant";
                return (
                  <div key={`${message.role}-${index}`} className={`flex gap-4 ${assistant ? "" : "justify-end"}`}>
                    {assistant ? (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ad46ff] to-[#2b7fff] text-white">
                        <IconChat />
                      </div>
                    ) : null}
                    <div className={`${assistant ? "max-w-[72%]" : "max-w-[56%]"}`}>
                      <div
                        className={`rounded-[16px] px-5 py-3 text-[14px] leading-[22px] ${
                          assistant
                            ? "bg-[#f3f4f6] text-[#101828]"
                            : "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white"
                        }`}
                      >
                        {message.content}
                      </div>
                      {assistant ? (
                        <div className="mt-2 flex items-center gap-2 pl-2 text-[12px] text-[#99a1af]">
                          <span>{formatTime(message.created_at)}</span>
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-black/5"
                            onClick={() => navigator.clipboard.writeText(message.content).catch(() => undefined)}
                          >
                            <IconCopy />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedProject ? (
            <div className="absolute bottom-[78px] left-6 right-6 flex flex-wrap items-center gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded-full bg-[#f3f4f6] px-3 py-[6px] text-[12px] font-medium text-[#364153]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <div className="absolute bottom-4 left-4 right-4 rounded-[16px] bg-[#f3f4f6] p-2">
            {error ? <p className="px-2 pb-1 text-[12px] text-[#fb2c36]">{error}</p> : null}
            <div className="flex items-center gap-2">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#6a7282]">
                <IconClip />
              </button>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={selectedProject ? "Ask anything about this project..." : "Ask me anything..."}
                className="h-9 flex-1 rounded-[8px] bg-transparent px-2 text-[14px] text-[#101828] placeholder:text-[#717182] outline-none"
              />
              <button
                type="button"
                disabled={!input.trim() || sending}
                onClick={() => void handleSend()}
                className="flex h-8 w-9 items-center justify-center rounded-[14px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white disabled:opacity-50"
              >
                <IconSend />
              </button>
            </div>
          </div>
        </section>

        <aside className="w-[320px] bg-[#f9fafb]">
          {selectedProject ? (
            <>
              <div className="border-b border-[#e5e7eb] bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-semibold tracking-[-0.44px] text-[#101828]">Project Context</h2>
                  <button
                    type="button"
                    className="rounded p-1 text-[#6a7282] hover:bg-black/5"
                    onClick={() => setSelectedProjectId(null)}
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[12px] text-[#6a7282]">All resources available to AI</p>
              </div>
              <div className="h-[calc(100vh-157px)] overflow-y-auto px-4 py-4">
                {projectContextLoading ? <p className="text-[12px] text-[#6a7282]">Loading project context...</p> : null}
                {projectContextError ? <p className="mb-2 text-[12px] text-[#ef4444]">{projectContextError}</p> : null}
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#364153]">PRDs ({projectPrds.length})</p>
                    <div className="space-y-2">
                      {projectPrds.slice(0, 4).map((prd) => (
                        <div key={prd.id} className="rounded-[14px] border border-black/10 bg-white px-3 py-3">
                          <p className="text-[12px] font-medium leading-[16px] text-[#101828]">
                            {prd.feature_name || "Untitled PRD"}
                          </p>
                          <p className="mt-2 text-[12px] text-[#6a7282]">{formatDate(prd.updated_at || prd.created_at)}</p>
                        </div>
                      ))}
                      {projectPrds.length === 0 ? (
                        <div className="rounded-[14px] border border-black/10 bg-white px-3 py-3 text-[12px] text-[#6a7282]">
                          No PRDs linked yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#364153]">Roadmaps ({projectRoadmap ? 1 : 0})</p>
                    {projectRoadmap ? (
                      <div className="rounded-[14px] border border-black/10 bg-white px-3 py-3">
                        <p className="text-[12px] font-medium leading-[16px] text-[#101828]">{projectRoadmap.title}</p>
                        {projectRoadmap.updated_at ? (
                          <p className="mt-2 text-[12px] text-[#6a7282]">{formatDate(projectRoadmap.updated_at)}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-black/10 bg-white px-3 py-3 text-[12px] text-[#6a7282]">
                        No roadmap linked yet.
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#364153]">Task Boards ({projectBoards.length})</p>
                    <div className="space-y-2">
                      {projectBoards.slice(0, 4).map((board) => (
                        <div key={board.id} className="rounded-[14px] border border-black/10 bg-white px-3 py-3">
                          <p className="text-[12px] font-medium leading-[16px] text-[#101828]">{board.title}</p>
                          <p className="mt-2 text-[12px] text-[#6a7282]">
                            {board.task_count > 0 ? `${board.task_count} tasks` : "No tasks yet"}
                          </p>
                        </div>
                      ))}
                      {projectBoards.length === 0 ? (
                        <div className="rounded-[14px] border border-black/10 bg-white px-3 py-3 text-[12px] text-[#6a7282]">
                          No task boards linked yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#e5e7eb] bg-white px-4 py-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.44px] text-[#101828]">Select Project Context</h2>
                <p className="text-[12px] text-[#6a7282]">Choose a project to get context-aware assistance</p>
              </div>
              <div className="h-[calc(100vh-157px)] overflow-y-auto px-4 py-4">
                <div className="space-y-2">
                  {projects.map((project, index) => {
                    const selected = selectedProjectId === project.id;
                    const color = project.color || PROJECT_COLORS[index % PROJECT_COLORS.length];
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        className={`w-full rounded-[10px] border bg-white px-4 py-4 text-left ${
                          selected ? "border-[#9810fa]" : "border-[#e5e7eb]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ backgroundColor: color }}>
                            <IconChat />
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-[#101828]">{project.title}</p>
                            <p className="text-[12px] text-[#6a7282]">
                              {project.prd_count ?? 0} PRDs • {project.task_count ?? 0} Tasks
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-[12px] leading-[16px] text-[#4a5565] line-clamp-2">
                          {project.description || "No project description yet."}
                        </p>
                      </button>
                    );
                  })}
                  {projects.length === 0 ? (
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-4 text-[12px] text-[#6a7282]">
                      No projects available yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
