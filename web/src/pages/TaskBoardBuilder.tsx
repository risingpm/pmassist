import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  bulkCreateTaskBoardTasks,
  createTaskBoard,
  generateTaskBoardDraft,
  getTaskBoard,
  listTaskBoards,
  updateTaskBoard,
  type TaskBoardRecord,
  type TaskPriority,
  type TaskStatus,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY } from "../constants";
import { getStoredAgentName } from "../utils/agentProfile";

type TaskItem = {
  id: string;
  title: string;
  description?: string;
  priority: "high" | "medium";
  tags: string[];
  assignee?: string;
};

type ChatMsg = { role: "assistant" | "user"; content: string };

type UiColumn = {
  id: string;
  title: string;
  dot: string;
  tasks: TaskItem[];
  status?: TaskStatus;
  removable?: boolean;
};

type ManualTaskForm = {
  title: string;
  description: string;
  priority: TaskPriority;
  assignee: string;
  labels: string[];
  labelInput: string;
};

function IconBack() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5Z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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

function IconClose() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const EMPTY_COLUMNS: UiColumn[] = [
  { id: "backlog", title: "Backlog", dot: "#99a1af", tasks: [], status: "todo", removable: false },
  { id: "todo", title: "Todo", dot: "#2b7fff", tasks: [], status: "todo", removable: false },
  { id: "in_progress", title: "In Progress", dot: "#f0b100", tasks: [], status: "in_progress", removable: false },
  { id: "done", title: "Done", dot: "#00c950", tasks: [], status: "done", removable: false },
];

const COLUMN_COLOR_OPTIONS = ["#ad46ff", "#2b7fff", "#00c950", "#f0b100", "#fb2c36", "#f6339a", "#615fff", "#ff6900"];

function normalizePriority(value: string | undefined): "high" | "medium" {
  return value === "high" || value === "critical" ? "high" : "medium";
}

function suggestTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Task Board";
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}...` : cleaned;
}

export default function TaskBoardBuilder() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [searchParams] = useSearchParams();
  const botName = useMemo(() => getStoredAgentName(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [board, setBoard] = useState<TaskBoardRecord | null>(null);
  const [boardName, setBoardName] = useState("Task Board");
  const [boardDescription, setBoardDescription] = useState("AI-generated tasks for your workspace");
  const [columns, setColumns] = useState<UiColumn[]>(EMPTY_COLUMNS);
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", content: `Hi! I'm ${botName}. I'll help you create a task board. What would you like to name your board?` },
  ]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftTasks, setDraftTasks] = useState<Array<{ title: string; description: string; priority: TaskPriority; status: TaskStatus }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalColumn, setTaskModalColumn] = useState<string>("todo");
  const [addColumnModalOpen, setAddColumnModalOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#ad46ff");
  const [manualTask, setManualTask] = useState<ManualTaskForm>({
    title: "",
    description: "",
    priority: "medium",
    assignee: "",
    labels: [],
    labelInput: "",
  });

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
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadBoard = async (boardId: string, wsId: string, uid: string) => {
    const detail = await getTaskBoard(boardId, wsId, uid);
    setBoard(detail.board);
    setBoardName(detail.board.title);
    setBoardDescription(detail.board.description || "AI-generated tasks for your workspace");

    const todoTasks = detail.columns.todo.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      priority: normalizePriority(task.priority),
      tags: [],
    }));
    const inProgressTasks = detail.columns.in_progress.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      priority: normalizePriority(task.priority),
      tags: [],
    }));
    const doneTasks = detail.columns.done.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      priority: normalizePriority(task.priority),
      tags: [],
    }));

    setColumns([
      { id: "backlog", title: "Backlog", dot: "#99a1af", tasks: [], status: "todo", removable: false },
      { id: "todo", title: "Todo", dot: "#2b7fff", tasks: todoTasks, status: "todo", removable: false },
      { id: "in_progress", title: "In Progress", dot: "#f0b100", tasks: inProgressTasks, status: "in_progress", removable: false },
      { id: "done", title: "Done", dot: "#00c950", tasks: doneTasks, status: "done", removable: false },
    ]);
  };

  useEffect(() => {
    if (!workspaceId || !userId) return;
    const requestedBoardId = searchParams.get("boardId");
    setLoading(true);
    listTaskBoards(workspaceId, userId)
      .then(async (boards) => {
        if (!boards.length) return;
        if (requestedBoardId) {
          const selected = boards.find((candidate) => candidate.id === requestedBoardId);
          if (selected) {
            await loadBoard(selected.id, workspaceId, userId);
            return;
          }
        }
        await loadBoard(boards[0].id, workspaceId, userId);
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Failed to load task board."))
      .finally(() => setLoading(false));
  }, [workspaceId, userId, searchParams]);

  const ensureBoard = async (): Promise<TaskBoardRecord | null> => {
    if (!workspaceId || !userId) return null;
    if (board) return board;
    const created = await createTaskBoard(workspaceId, userId, {
      title: boardName,
      description: boardDescription,
    });
    setBoard(created);
    return created;
  };

  const handleSend = async () => {
    if (!workspaceId || !userId) return;
    const prompt = message.trim();
    if (!prompt) return;

    setMessage("");
    setSending(true);
    setChat((prev) => [...prev, { role: "user", content: prompt }]);

    try {
      if (!board && boardName === "Task Board") {
        setBoardName(suggestTitle(prompt));
      }
      const activeBoard = await ensureBoard();
      if (!activeBoard) return;

      const generated = await generateTaskBoardDraft(activeBoard.id, workspaceId, {
        user_id: userId,
        prompt,
      });

      const mapped = generated.tasks.map((task, index) => ({
        id: `draft-${index}`,
        title: task.title,
        description: task.description || undefined,
        priority: normalizePriority(task.priority),
        tags: [],
      }));

      const todo = mapped.filter((_, idx) => (generated.tasks[idx].status || "todo") === "todo");
      const inProgress = mapped.filter((_, idx) => (generated.tasks[idx].status || "todo") === "in_progress");
      const done = mapped.filter((_, idx) => (generated.tasks[idx].status || "todo") === "done");

      setColumns([
        { id: "backlog", title: "Backlog", dot: "#99a1af", tasks: [], status: "todo", removable: false },
        { id: "todo", title: "Todo", dot: "#2b7fff", tasks: todo, status: "todo", removable: false },
        { id: "in_progress", title: "In Progress", dot: "#f0b100", tasks: inProgress, status: "in_progress", removable: false },
        { id: "done", title: "Done", dot: "#00c950", tasks: done, status: "done", removable: false },
      ]);

      setDraftTasks(
        generated.tasks.map((task) => ({
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
        }))
      );

      setChat((prev) => [...prev, { role: "assistant", content: generated.assistant_message }]);
      setToast("Draft tasks generated.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to generate tasks.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveBoard = async () => {
    if (!workspaceId || !userId) return;
    setSaving(true);
    try {
      const activeBoard = await ensureBoard();
      if (!activeBoard) return;

      await updateTaskBoard(activeBoard.id, workspaceId, userId, {
        title: boardName,
        description: boardDescription,
      });

      if (draftTasks.length) {
        await bulkCreateTaskBoardTasks(activeBoard.id, workspaceId, userId, {
          tasks: draftTasks.map((task) => ({
            title: task.title,
            description: task.description,
            priority: task.priority,
            status: task.status,
          })),
        });
        setDraftTasks([]);
      }

      await loadBoard(activeBoard.id, workspaceId, userId);
      setToast("Task board saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to save board.");
    } finally {
      setSaving(false);
    }
  };

  const openManualTaskModal = (columnId: string) => {
    setTaskModalColumn(columnId);
    setManualTask({
      title: "",
      description: "",
      priority: "medium",
      assignee: "",
      labels: [],
      labelInput: "",
    });
    setTaskModalOpen(true);
  };

  const closeManualTaskModal = () => {
    setTaskModalOpen(false);
  };

  const addManualLabel = () => {
    const next = manualTask.labelInput.trim();
    if (!next) return;
    if (manualTask.labels.includes(next)) {
      setManualTask((prev) => ({ ...prev, labelInput: "" }));
      return;
    }
    setManualTask((prev) => ({ ...prev, labels: [...prev.labels, next], labelInput: "" }));
  };

  const handleManualTaskCreate = () => {
    const title = manualTask.title.trim();
    if (!title) return;

    const targetColumn = columns.find((column) => column.id === taskModalColumn);
    const statusForDraft: TaskStatus = targetColumn?.status || "todo";
    const task: TaskItem = {
      id: `manual-${Date.now()}`,
      title,
      description: manualTask.description.trim() || undefined,
      priority: normalizePriority(manualTask.priority),
      tags: manualTask.labels,
      assignee: manualTask.assignee.trim() ? manualTask.assignee.trim().slice(0, 2).toUpperCase() : undefined,
    };

    setColumns((prev) =>
      prev.map((column) => {
        if (column.id !== taskModalColumn) return column;
        return { ...column, tasks: [...column.tasks, task] };
      })
    );

    setDraftTasks((prev) => [
      ...prev,
      {
        title,
        description: manualTask.description.trim(),
        priority: manualTask.priority,
        status: statusForDraft,
      },
    ]);

    setTaskModalOpen(false);
    setToast("Task added to draft board.");
  };

  const openAddColumnModal = () => {
    setNewColumnName("");
    setNewColumnColor("#ad46ff");
    setAddColumnModalOpen(true);
  };

  const closeAddColumnModal = () => {
    setAddColumnModalOpen(false);
  };

  const handleAddColumn = () => {
    const title = newColumnName.trim();
    if (!title) return;
    const baseId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom-column";
    let nextId = baseId;
    let suffix = 1;
    while (columns.some((column) => column.id === nextId)) {
      suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    setColumns((prev) => [
      ...prev,
      {
        id: nextId,
        title,
        dot: newColumnColor,
        tasks: [],
        status: "todo",
        removable: true,
      },
    ]);
    setAddColumnModalOpen(false);
    setToast("Column added.");
  };

  const canSend = useMemo(() => Boolean(message.trim()) && !sending, [message, sending]);

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="flex min-h-screen">
        <aside className="w-full max-w-[400px] border-r border-[#e5e7eb] bg-white">
          <div className="border-b border-[#e5e7eb] px-6 py-6">
            <button
              type="button"
              className="mb-4 inline-flex items-center gap-2 text-[14px] font-medium text-[#0a0a0a]"
              onClick={() => {
                if (workspaceId) {
                  navigate(`/workspaces/${workspaceId}/tasks`);
                  return;
                }
                navigate(-1);
              }}
            >
              <IconBack />
              Back
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                <IconSparkles />
              </div>
              <div>
                <h1 className="text-[20px] font-semibold tracking-[-0.44px] text-[#101828]">Task Board Builder</h1>
                <p className="text-[12px] text-[#6a7282]">AI-powered task management</p>
              </div>
            </div>
          </div>

          <div className="flex h-[calc(100vh-151px-129px)] flex-col gap-4 overflow-y-auto px-6 py-6">
            {chat.map((msg, idx) =>
              msg.role === "assistant" ? (
                <div key={idx} className="max-w-[300px] rounded-2xl bg-[#f3f4f6] px-4 py-3 text-[14px] leading-[22px] text-[#101828]">
                  {msg.content}
                </div>
              ) : (
                <div key={idx} className="ml-auto max-w-[240px] rounded-2xl bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-3 text-[14px] leading-[22px] text-white">
                  {msg.content}
                </div>
              )
            )}
          </div>

          <div className="border-t border-[#e5e7eb] bg-[#f9fafb] p-4">
            <button type="button" className="mb-3 h-12 w-full rounded-[10px] border-2 border-[#dab2ff] text-[14px] font-medium text-[#9810fa]">
              Add Context
            </button>
            <div className="flex gap-2">
              <input
                className="h-9 flex-1 rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                placeholder="Describe your task board..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] disabled:opacity-50"
                onClick={() => void handleSend()}
                disabled={!canSend}
              >
                <IconSend />
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-white px-6 py-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <input
                  className="w-full max-w-[620px] bg-transparent text-[30px] font-bold text-[#101828] outline-none"
                  value={boardName}
                  onChange={(event) => setBoardName(event.target.value)}
                />
                <input
                  className="mt-1 w-full max-w-[720px] bg-transparent text-[16px] text-[#6a7282] outline-none"
                  value={boardDescription}
                  onChange={(event) => setBoardDescription(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="h-9 shrink-0 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium text-white disabled:opacity-60"
                onClick={() => void handleSaveBoard()}
                disabled={saving || loading}
              >
                {saving ? "Saving..." : "Save Board"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1" />
              <button
                type="button"
                className="h-8 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] text-[#0a0a0a]"
                onClick={openAddColumnModal}
              >
                + Add Column
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6">
            <div className="flex min-w-full w-max gap-4">
              {columns.map((column) => (
                <div key={column.id} className="w-[320px] shrink-0">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.dot }} />
                      <h3 className="text-[18px] font-semibold text-[#101828]">{column.title}</h3>
                      <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[12px] text-[#6a7282]">{column.tasks.length}</span>
                    </div>
                    <button
                      type="button"
                      className="text-[#9ca3af] disabled:opacity-40"
                      disabled={!column.removable}
                      onClick={() => {
                        if (!column.removable) return;
                        setColumns((prev) => prev.filter((candidate) => candidate.id !== column.id));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div className="rounded-[10px] bg-[#f9fafb] p-3">
                    <div className="space-y-2">
                      {column.tasks.map((task) => (
                        <article key={task.id} className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                          <p className="text-[14px] font-medium text-[#101828]">{task.title}</p>
                          {task.description ? <p className="mt-1 text-[12px] leading-4 text-[#6a7282]">{task.description}</p> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[12px] ${task.priority === "high" ? "bg-[#fff7ed] text-[#f54900]" : "bg-[#fefce8] text-[#d08700]"}`}>
                              {task.priority}
                            </span>
                            {task.tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-[#faf5ff] px-2 py-0.5 text-[12px] text-[#8200db]">
                                {tag}
                              </span>
                            ))}
                            {task.assignee ? (
                              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#ad46ff] to-[#2b7fff] text-[10px] text-white">
                                {task.assignee}
                              </span>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 h-12 w-full rounded-[10px] border-2 border-[#d1d5dc] text-[14px] font-medium text-[#6a7282]"
                      onClick={() => openManualTaskModal(column.id)}
                    >
                      + Add task
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {taskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[672px] overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-5">
              <h3 className="text-[20px] font-bold tracking-[-0.45px] text-[#101828]">New Task</h3>
              <button type="button" className="text-[#9ca3af] hover:text-[#6a7282]" onClick={closeManualTaskModal}>
                <IconClose />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <label className="block">
                <span className="text-[14px] font-medium text-[#364153]">Task Title *</span>
                <input
                  value={manualTask.title}
                  onChange={(event) => setManualTask((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Enter task title..."
                  className="mt-2 h-9 w-full rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                />
              </label>

              <label className="block">
                <span className="text-[14px] font-medium text-[#364153]">Description</span>
                <textarea
                  value={manualTask.description}
                  onChange={(event) => setManualTask((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Add more details..."
                  rows={4}
                  className="mt-2 w-full rounded-[10px] border border-[#d1d5dc] px-3 py-2 text-[16px] tracking-[-0.31px] text-[#101828] placeholder:text-[rgba(10,10,10,0.5)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[14px] font-medium text-[#364153]">Priority</span>
                  <select
                    value={manualTask.priority}
                    onChange={(event) =>
                      setManualTask((prev) => ({
                        ...prev,
                        priority: event.target.value as TaskPriority,
                      }))
                    }
                    className="mt-2 h-[39px] w-full rounded-[10px] border border-[#d1d5dc] bg-white px-3 text-[14px] text-[#101828]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[14px] font-medium text-[#364153]">Assignee</span>
                  <input
                    value={manualTask.assignee}
                    onChange={(event) => setManualTask((prev) => ({ ...prev, assignee: event.target.value }))}
                    placeholder="Assign to..."
                    className="mt-2 h-9 w-full rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                  />
                </label>
              </div>

              <div>
                <span className="text-[14px] font-medium text-[#364153]">Labels</span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={manualTask.labelInput}
                    onChange={(event) => setManualTask((prev) => ({ ...prev, labelInput: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualLabel();
                      }
                    }}
                    placeholder="Add label..."
                    className="h-9 flex-1 rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                  />
                  <button
                    type="button"
                    className="h-8 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                    onClick={addManualLabel}
                  >
                    Add
                  </button>
                </div>
                {manualTask.labels.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {manualTask.labels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="rounded-full bg-[#faf5ff] px-2 py-1 text-[12px] font-medium text-[#8200db]"
                        onClick={() =>
                          setManualTask((prev) => ({
                            ...prev,
                            labels: prev.labels.filter((item) => item !== label),
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-3 border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-6">
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] border border-black/10 bg-white text-[14px] font-medium text-[#0a0a0a]"
                onClick={closeManualTaskModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                onClick={handleManualTaskCreate}
                disabled={!manualTask.title.trim()}
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addColumnModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[448px] overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-[0px_25px_50px_0px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-6 py-5">
              <h3 className="text-[20px] font-bold tracking-[-0.45px] text-[#101828]">Add Column</h3>
              <button type="button" className="text-[#9ca3af] hover:text-[#6a7282]" onClick={closeAddColumnModal}>
                <IconClose />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <label className="block">
                <span className="text-[14px] font-medium text-[#364153]">Column Name *</span>
                <input
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  placeholder="e.g., Review, Testing..."
                  className="mt-2 h-9 w-full rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
                />
              </label>

              <div>
                <span className="text-[14px] font-medium text-[#364153]">Color</span>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {COLUMN_COLOR_OPTIONS.map((color) => {
                    const active = color === newColumnColor;
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`rounded-[10px] border-2 p-[10px] ${active ? "border-[#9810fa]" : "border-[#e5e7eb]"}`}
                        onClick={() => setNewColumnColor(color)}
                      >
                        <span className="block h-6 w-full rounded-[4px]" style={{ backgroundColor: color }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-6">
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] border border-black/10 bg-white text-[14px] font-medium text-[#0a0a0a]"
                onClick={closeAddColumnModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                onClick={handleAddColumn}
                disabled={!newColumnName.trim()}
              >
                Add Column
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-[8px] border border-[#ededed] bg-white px-4 py-3 text-[13px] font-medium text-[#171717] shadow-[0px_4px_12px_rgba(0,0,0,0.1)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
