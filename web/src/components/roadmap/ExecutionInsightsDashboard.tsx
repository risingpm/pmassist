import { useEffect, useState } from "react";
import { getExecutionInsights, type RoadmapExecutionInsights } from "../../api";
import RoadmapProgressBar from "./RoadmapProgressBar";

type ExecutionInsightsDashboardProps = {
  projectId: string;
  workspaceId: string | null;
  refreshKey: number;
};

export default function ExecutionInsightsDashboard({
  projectId,
  workspaceId,
  refreshKey,
}: ExecutionInsightsDashboardProps) {
  const [insights, setInsights] = useState<RoadmapExecutionInsights | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    getExecutionInsights(projectId, workspaceId)
      .then((data) => {
        setInsights(data);
        setError(null);
      })
      .catch((err) =>
        setError(err.message || "Failed to load execution insights"),
      )
      .finally(() => setLoading(false));
  }, [projectId, workspaceId, refreshKey]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Execution insights
          </p>
          <h3 className="text-lg font-semibold text-slate-900">
            Project health
          </h3>
        </div>
        {insights && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Velocity (7d): {insights.velocity_last_7_days}
          </span>
        )}
      </div>
      {loading && (
        <p className="mt-4 text-sm text-slate-500">Calculating progress…</p>
      )}
      {error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}
      {insights && !loading && !error && (
        <div className="mt-5 space-y-4 text-sm text-slate-700">
          <RoadmapProgressBar
            value={insights.overall_progress}
            label="Overall progress"
          />
          <div className="grid gap-3">
            {insights.phase_summaries.slice(0, 2).map((phase) => (
              <div
                key={phase.phase_id}
                className="rounded-2xl border border-slate-100 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {phase.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {phase.completed_tasks}/{phase.total_tasks || 0} tasks
                  complete
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">{insights.ai_summary}</p>
        </div>
      )}
    </div>
  );
}
