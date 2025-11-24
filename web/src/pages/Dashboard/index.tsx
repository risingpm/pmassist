import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";

import {
  getDashboardOverview,
  getDashboardCoach,
  type DashboardOverview,
  type DashboardCoach,
} from "../../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../../constants";
import AgentAvatar from "../../components/AgentAvatar";
import useAgentName from "../../hooks/useAgentName";

function useSessionUser() {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const authRaw = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (authRaw) {
      try {
        const parsed = JSON.parse(authRaw) as { id?: string };
        if (parsed?.id) return parsed.id;
      } catch {
        return window.sessionStorage.getItem(USER_ID_KEY);
      }
    }
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);
}

export default function WorkspaceDashboard() {
  const navigate = useNavigate();
  const sessionUserId = useSessionUser();
  const agentName = useAgentName();
  const [workspaceId] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  const workspaceName = useMemo(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  }, []);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [coach, setCoach] = useState<DashboardCoach | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !sessionUserId) {
      setError("Select a workspace to view the dashboard.");
      setOverviewLoading(false);
      return;
    }
    const run = async () => {
      setOverviewLoading(true);
      setError(null);
      try {
        const data = await getDashboardOverview(workspaceId, sessionUserId);
        setOverview(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data.");
      } finally {
        setOverviewLoading(false);
      }
    };
    run();
  }, [workspaceId, sessionUserId]);

  const fetchCoach = async () => {
    if (!workspaceId || !sessionUserId) return;
    setCoachLoading(true);
    setCoachError(null);
    try {
      const insight = await getDashboardCoach(workspaceId, sessionUserId);
      setCoach(insight);
    } catch (err: any) {
      setCoachError(err.message || "AI coach is unavailable. Try again later.");
    } finally {
      setCoachLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId && sessionUserId) {
      fetchCoach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, sessionUserId]);

  const renderVelocityBars = () => {
    if (!overview) return null;
    const max = Math.max(...overview.sprint.velocity_trend, 1);
    return (
      <div className="mt-4 flex items-end gap-2">
        {overview.sprint.velocity_trend.map((value, idx) => (
          <div key={idx} className="flex-1">
            <div
              className="rounded-full bg-blue-500 transition-all"
              style={{ height: `${(value / max) * 80 || 4}px` }}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Workspace overview
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} Dashboard</h1>
            <p className="text-sm text-slate-500">
              Monitor planning, execution, and AI insights across your product stack.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/projects"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
            >
              View Projects
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!workspaceId) return;
                navigate(`/projects?workspace=${workspaceId}`);
              }}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Open Kanban
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <DashboardCard title="Active PRDs" loading={overviewLoading}>
              {overview?.prds.length ? (
                <ul className="space-y-3 text-sm text-slate-600">
                  {overview.prds.map((prd) => (
                    <li key={prd.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{prd.title}</p>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {prd.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Updated {new Date(prd.updated_at).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No active PRDs yet. Generate one from the Projects view." />
              )}
            </DashboardCard>

            <DashboardCard title="Roadmap progress" loading={overviewLoading}>
              {overview ? (
                <div>
                  <p className="text-sm text-slate-500">
                    Current phase:{" "}
                    <span className="font-semibold text-slate-900">
                      {overview.roadmap.current_phase || "Not defined"}
                    </span>
                  </p>
                  <div className="mt-3">
                    <div className="h-3 rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                        style={{ width: `${overview.roadmap.completion_percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {overview.roadmap.done_tasks}/{overview.roadmap.total_tasks || "—"} tasks completed
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState message="Roadmap progress will appear once tasks are linked." />
              )}
            </DashboardCard>

            <DashboardCard title="Sprint velocity" loading={overviewLoading}>
              {overview ? (
                <div>
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <p>
                      Current velocity:{" "}
                      <span className="font-semibold text-slate-900">{overview.sprint.velocity.toFixed(2)}</span>{" "}
                      tasks/day
                    </p>
                    <p className="text-xs text-slate-400">
                      Last 7 days: {overview.sprint.completed_last_7_days}
                    </p>
                  </div>
                  {renderVelocityBars()}
                </div>
              ) : (
                <EmptyState message="Sprint data will appear once tasks start closing." />
              )}
            </DashboardCard>
          </div>

          <div className="space-y-5">
            <DashboardCard title="Task summary" loading={overviewLoading}>
              {overview ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: "To Do", value: overview.tasks.todo, accent: "bg-slate-100 text-slate-800" },
                    { label: "In Progress", value: overview.tasks.in_progress, accent: "bg-amber-100 text-amber-800" },
                    { label: "Done", value: overview.tasks.done, accent: "bg-emerald-100 text-emerald-800" },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-2xl px-4 py-3 ${item.accent}`}>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{item.label}</p>
                      <p className="text-2xl font-semibold">{item.value}</p>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate("/projects")}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 md:col-span-3"
                  >
                    Open Kanban board
                  </button>
                </div>
              ) : (
                <EmptyState message="Tasks will appear as soon as work items are captured." />
              )}
            </DashboardCard>

            <DashboardCard
              title={
                <div className="flex items-center gap-3">
                  <AgentAvatar size="sm" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workspace AI</p>
                    <p className="text-base font-semibold text-slate-900">Chat with {agentName}</p>
                  </div>
                </div>
              }
              loading={coachLoading}
            >
              {coachError && (
                <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {coachError}
                </div>
              )}
              {coach ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">{coach.message}</p>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {coach.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <p>Confidence: {(coach.confidence * 100).toFixed(0)}%</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={fetchCoach}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white"
                      >
                        Refresh insight
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState message={`${agentName} will share insights once data is available.`} />
              )}
            </DashboardCard>
          </div>
        </div>
      </div>
    </div>
  );
}

type DashboardCardProps = {
  title: ReactNode;
  children: React.ReactNode;
  loading?: boolean;
};

function DashboardCard({ title, children, loading = false }: DashboardCardProps) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="mt-4 text-sm text-slate-600">
        {loading ? <Skeleton /> : children}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 rounded-full bg-slate-100" />
      <div className="h-4 rounded-full bg-slate-100" />
      <div className="h-4 w-2/3 rounded-full bg-slate-100" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400">{message}</p>;
}
