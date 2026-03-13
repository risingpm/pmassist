import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getTaskBoard, listTaskBoards, type TaskBoardRecord } from "../api";
import { AUTH_USER_KEY, USER_ID_KEY } from "../constants";

type BoardCard = {
  board: TaskBoardRecord;
  backlog: number;
  todo: number;
  inProgress: number;
  done: number;
  total: number;
};

function IconBack() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <circle cx="9.2" cy="9.2" r="5.7" stroke="currentColor" strokeWidth="1.7" />
      <path d="m13.7 13.7 2.8 2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M10 4.2v11.6M4.2 10h11.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconBoard() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="14" rx="3" stroke="white" strokeWidth="1.6" />
      <path d="m7 10 2.2 2.2L13.2 8" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 2.5v2M11 2.5v2M2.5 6.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function formatRelativeDay(iso: string): string {
  const updatedDate = new Date(iso);
  if (Number.isNaN(updatedDate.getTime())) return "Recently";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfUpdated = new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfUpdated.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export default function TaskBoardsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardCard[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    setLoading(true);
    listTaskBoards(workspaceId, userId)
      .then(async (records) => {
        const details = await Promise.all(
          records.map(async (board) => {
            try {
              const detail = await getTaskBoard(board.id, workspaceId, userId);
              const todo = detail.columns.todo.length;
              const inProgress = detail.columns.in_progress.length;
              const done = detail.columns.done.length;
              const total = board.task_count || todo + inProgress + done;
              return {
                board,
                backlog: Math.max(0, total - (todo + inProgress + done)),
                todo,
                inProgress,
                done,
                total,
              } satisfies BoardCard;
            } catch {
              return {
                board,
                backlog: 0,
                todo: 0,
                inProgress: 0,
                done: 0,
                total: board.task_count ?? 0,
              } satisfies BoardCard;
            }
          })
        );
        setBoards(details.sort((a, b) => new Date(b.board.updated_at).getTime() - new Date(a.board.updated_at).getTime()));
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Failed to load task boards."))
      .finally(() => setLoading(false));
  }, [workspaceId, userId]);

  const filteredBoards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((item) => {
      const title = item.board.title.toLowerCase();
      const description = (item.board.description || "").toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }, [boards, search]);

  const totals = useMemo(() => {
    return filteredBoards.reduce(
      (acc, current) => {
        acc.boards += 1;
        acc.tasks += current.total;
        acc.inProgress += current.inProgress;
        acc.done += current.done;
        return acc;
      },
      { boards: 0, tasks: 0, inProgress: 0, done: 0 }
    );
  }, [filteredBoards]);

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="border-b border-[#e5e7eb] bg-white px-8 pb-6 pt-6">
        <button
          type="button"
          className="mb-4 inline-flex items-center gap-2 text-[14px] font-medium text-[#0a0a0a]"
          onClick={() => {
            if (workspaceId) {
              navigate(`/workspaces/${workspaceId}/home`);
              return;
            }
            navigate(-1);
          }}
        >
          <IconBack />
          Back to Dashboard
        </button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold leading-[36px] tracking-[0.39px] text-[#101828]">Task Boards</h1>
            <p className="mt-1 text-[16px] text-[#4a5565]">Manage your tasks with Linear-style boards</p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium text-white"
            onClick={() => {
              if (!workspaceId) return;
              navigate(`/workspaces/${workspaceId}/tasks/new`);
            }}
          >
            <IconPlus />
            New Task Board
          </button>
        </div>

        <div className="relative mt-6 w-full max-w-[448px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search task boards..."
            className="h-9 w-full rounded-[8px] bg-[#f3f3f5] pl-10 pr-3 text-[14px] text-[#101828] placeholder:text-[#717182]"
          />
          <div className="pointer-events-none absolute left-3 top-2.5 text-[#9ca3af]">
            <IconSearch />
          </div>
        </div>
      </div>

      <main className="px-8 py-8">
        {loading ? <p className="text-[14px] text-[#6a7282]">Loading task boards...</p> : null}

        {!loading && filteredBoards.length === 0 ? (
          <div className="rounded-[14px] border border-black/10 bg-white p-8">
            <p className="text-[16px] font-semibold text-[#101828]">No task boards yet</p>
            <p className="mt-2 text-[14px] text-[#6a7282]">Create your first board and use ProductBot to draft tasks instantly.</p>
            <button
              type="button"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium text-white"
              onClick={() => {
                if (!workspaceId) return;
                navigate(`/workspaces/${workspaceId}/tasks/new`);
              }}
            >
              <IconPlus />
              New Task Board
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredBoards.map((item) => {
            const total = Math.max(1, item.total);
            const progress = Math.round((item.done / total) * 100);
            return (
              <button
                key={item.board.id}
                type="button"
                className="text-left"
                onClick={() => {
                  if (!workspaceId) return;
                  navigate(`/workspaces/${workspaceId}/tasks/new?boardId=${item.board.id}`);
                }}
              >
                <article className="h-full rounded-[14px] border border-black/10 bg-white p-6 transition hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                      <IconBoard />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[18px] font-bold leading-[27px] tracking-[-0.44px] text-[#101828]">{item.board.title}</h3>
                      <p className="mt-1 line-clamp-2 text-[14px] leading-[20px] text-[#6a7282]">
                        {item.board.description || "Task board overview"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="mb-2 flex items-center justify-between text-[14px]">
                      <span className="text-[#4a5565]">Progress</span>
                      <span className="font-semibold text-[#101828]">
                        {item.done} / {item.total} tasks
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#e5e7eb]">
                      <div className="h-2 rounded-full bg-gradient-to-r from-[#9810fa] to-[#155dfc]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f9fafb] px-3 py-1 text-[12px] text-[#364153]">
                      <span className="h-2 w-2 rounded-full bg-[#99a1af]" />
                      Backlog ({item.backlog})
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f9fafb] px-3 py-1 text-[12px] text-[#364153]">
                      <span className="h-2 w-2 rounded-full bg-[#2b7fff]" />
                      Todo ({item.todo})
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f9fafb] px-3 py-1 text-[12px] text-[#364153]">
                      <span className="h-2 w-2 rounded-full bg-[#f0b100]" />
                      In Progress ({item.inProgress})
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f9fafb] px-3 py-1 text-[12px] text-[#364153]">
                      <span className="h-2 w-2 rounded-full bg-[#00c950]" />
                      Done ({item.done})
                    </span>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[#e5e7eb] pt-4 text-[12px] text-[#6a7282]">
                    <span className="inline-flex items-center gap-1">
                      <IconCalendar />
                      {formatRelativeDay(item.board.updated_at)}
                    </span>
                    {item.inProgress > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fefce8] px-3 py-1 text-[#d08700]">
                        <span className="h-2 w-2 rounded-full bg-[#f0b100]" />
                        {item.inProgress} in progress
                      </span>
                    ) : null}
                  </div>
                </article>
              </button>
            );
          })}
        </div>

        {!loading && filteredBoards.length > 0 ? (
          <section className="mt-8 rounded-[14px] border border-[#e9d4ff] bg-gradient-to-r from-[#faf5ff] to-[#eff6ff] px-6 py-6">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-[14px] text-[#4a5565]">Total Boards</p>
                <p className="text-[30px] font-bold leading-[36px] tracking-[0.39px] text-[#101828]">{totals.boards}</p>
              </div>
              <div>
                <p className="text-[14px] text-[#4a5565]">Total Tasks</p>
                <p className="text-[30px] font-bold leading-[36px] tracking-[0.39px] text-[#101828]">{totals.tasks}</p>
              </div>
              <div>
                <p className="text-[14px] text-[#4a5565]">In Progress</p>
                <p className="text-[30px] font-bold leading-[36px] tracking-[0.39px] text-[#d08700]">{totals.inProgress}</p>
              </div>
              <div>
                <p className="text-[14px] text-[#4a5565]">Completed</p>
                <p className="text-[30px] font-bold leading-[36px] tracking-[0.39px] text-[#00a63e]">{totals.done}</p>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-[8px] border border-[#ededed] bg-white px-4 py-3 text-[13px] font-medium text-[#171717] shadow-[0px_4px_12px_rgba(0,0,0,0.1)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
