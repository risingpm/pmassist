import { useEffect, useState } from "react";
import type { AgentRunLog, WorkspaceAgent } from "../api";
import { getAgentRunHistory } from "../api";
import { SURFACE_CARD, SURFACE_MUTED } from "../styles/theme";

type AgentRunHistoryProps = {
  agent: WorkspaceAgent | null;
  workspaceId: string | null;
};

export default function AgentRunHistory({ agent, workspaceId }: AgentRunHistoryProps) {
  const [runs, setRuns] = useState<AgentRunLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agent || !workspaceId) {
      setRuns([]);
      return;
    }
    setLoading(true);
    getAgentRunHistory(workspaceId, agent.id)
      .then(setRuns)
      .catch((err) => setError(err.message || "Failed to load run history"))
      .finally(() => setLoading(false));
  }, [agent, workspaceId]);

  return (
    <div className={`${SURFACE_CARD} h-full`}>
      <header className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Run history</p>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </header>
      <div className="max-h-[320px] overflow-y-auto px-4 py-3 text-sm">
        {loading ? (
          <p className="text-slate-500">Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className="text-slate-500">No runs logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className={`${SURFACE_MUTED} p-3`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {new Date(run.created_at).toLocaleString()} · {run.status}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{run.prompt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
