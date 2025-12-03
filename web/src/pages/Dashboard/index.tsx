import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, Link, useParams } from "react-router-dom";

import { getDashboardOverview, type DashboardOverview, type WorkspaceInsight } from "../../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../../constants";
import AgentAvatar from "../../components/AgentAvatar";
import useAgentName from "../../hooks/useAgentName";
import useWorkspaceInsights from "../../hooks/useWorkspaceInsights";
import { SURFACE_CARD, SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, BODY_SUBTLE } from "../../styles/theme";

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
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const sessionUserId = useSessionUser();
  const agentName = useAgentName();
  const workspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [routeWorkspaceId]);
  const workspaceName = useMemo(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  }, []);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachDrawerOpen, setCoachDrawerOpen] = useState(false);
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const { insight, loading: coachLoading, error: coachError, regenerate, regenerating } = useWorkspaceInsights(
    workspaceId,
    sessionUserId
  );

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

  const handleRegenerate = async () => {
    setCoachStatus("Refreshing insight…");
    const updated = await regenerate();
    if (updated) {
      const ts = new Date(updated.generated_at);
      setCoachStatus(`Insight refreshed ${ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
    } else if (!coachError) {
      setCoachStatus(null);
    }
  };

  const quickNavItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: false },
      { label: "Insights", path: `/workspaces/${workspaceId}/insights`, active: true },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Knowledge", path: `/workspaces/${workspaceId}/knowledge`, active: false },
      { label: "Members", path: `/workspaces/${workspaceId}/projects/members`, active: false },
      { label: "Templates", path: `/workspaces/${workspaceId}/templates`, active: false },
    ];
  }, [workspaceId]);

  useEffect(() => {
    if (coachError) {
      setCoachStatus(null);
    }
  }, [coachError]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} py-10`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>Workspace overview</p>
            <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} Dashboard</h1>
            <p className={BODY_SUBTLE}>Monitor planning, execution, and AI insights across your product stack.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={workspaceId ? `/workspaces/${workspaceId}/projects` : "/projects"} className={SECONDARY_BUTTON}>
              View Projects
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!workspaceId) return;
                navigate(`/workspaces/${workspaceId}/projects`);
              }}
              className={PRIMARY_BUTTON}
            >
              Open Kanban
            </button>
          </div>
        </header>

        {quickNavItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {quickNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className={`rounded-full px-4 py-2 ${
                  item.active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

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
                    <p className="text-base font-semibold text-slate-900">AI Coach — {agentName}</p>
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
              {!coachError && insight ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">{insight.summary}</p>
                  <p className="text-xs text-slate-400">
                    Updated {new Date(insight.generated_at).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <div className="space-y-2">
                    {insight.recommendations.slice(0, 3).map((item, idx) => (
                      <div key={`${item.title}-${idx}`} className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-blue-500">{item.severity || "Insight"}</p>
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-600">{item.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setCoachDrawerOpen(true)}
                      className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {regenerating ? "Refreshing..." : "Regenerate"}
                    </button>
                  </div>
                  {coachStatus && <p className="text-xs text-slate-400">{coachStatus}</p>}
                </div>
              ) : (
                <EmptyState message={`${agentName} will share insights once data is available.`} />
              )}
            </DashboardCard>

          </div>
        </div>
      </div>
      {coachDrawerOpen && insight && (
        <CoachDrawer
          insight={insight}
          agentName={agentName}
          onClose={() => setCoachDrawerOpen(false)}
          onRefresh={handleRegenerate}
          refreshing={regenerating}
        />
      )}
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
    <div className={`${SURFACE_CARD} p-6`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div className={`mt-4 ${BODY_SUBTLE}`}>{loading ? <Skeleton /> : children}</div>
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
  return <p className={BODY_SUBTLE}>{message}</p>;
}

type CoachDrawerProps = {
  insight: WorkspaceInsight;
  agentName: string;
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

function CoachDrawer({ insight, agentName, onClose, onRefresh, refreshing }: CoachDrawerProps) {
  const verification = insight.verification;
  const verificationTone =
    verification?.status === "passed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : verification?.status === "failed"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-slate-900/40 backdrop-blur">
      <div className="mt-10 w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className={SECTION_LABEL}>AI Coach</p>
            <h3 className="text-xl font-semibold text-slate-900">{agentName} insights</h3>
            <p className={BODY_SUBTLE}>Updated {new Date(insight.generated_at).toLocaleString()}</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onRefresh} disabled={refreshing} className={SECONDARY_BUTTON}>
              {refreshing ? "Refreshing..." : "Regenerate"}
            </button>
            <button type="button" onClick={onClose} className={PRIMARY_BUTTON}>
              Close
            </button>
          </div>
        </div>
        <div className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <section className="space-y-4">
            {verification && (
              <div className={`rounded-2xl border px-3 py-2 text-xs ${verificationTone}`}>
                {verification.message}
              </div>
            )}
            <p className={BODY_SUBTLE}>{insight.summary}</p>
            <div className="space-y-3">
              {insight.recommendations.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-blue-500">{item.severity || "Insight"}</p>
                  <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
                  <p className="text-sm text-slate-600">{item.description}</p>
                  {item.related_entry_title && (
                    <p className="text-xs text-slate-400">Related: {item.related_entry_title}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className={SECTION_LABEL}>Context Used</p>
            {insight.context_entries.length === 0 && (
              <p className="text-sm text-slate-500">No references captured for this insight.</p>
            )}
            {insight.context_entries.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.type}</p>
                <p className="text-xs text-slate-500">{entry.snippet}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
