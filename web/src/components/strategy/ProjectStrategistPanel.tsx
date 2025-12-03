import { useEffect, useState } from "react";
import {
  getStrategyOverview,
  regenerateStrategy,
  type StrategyOverview,
} from "../../api";
import StrategicSummaryCard from "./StrategicSummaryCard";
import StrategicPillarsGrid from "./StrategicPillarsGrid";
import StrategicInsightFeed from "./StrategicInsightFeed";
import AskStrategistChat from "./AskStrategistChat";

interface ProjectStrategistPanelProps {
  workspaceId: string | null;
  projectId: string;
  userId: string | null;
}

export default function ProjectStrategistPanel({ workspaceId, projectId, userId }: ProjectStrategistPanelProps) {
  const [overview, setOverview] = useState<StrategyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let canceled = false;

    const run = async () => {
      if (!workspaceId || !userId) {
        setOverview(null);
        setError("Select a workspace member with access to view strategist insights.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getStrategyOverview(workspaceId, projectId, userId, false, controller.signal);
        if (canceled) return;
        setOverview(data);
        setError(null);
      } catch (err: any) {
        if (err?.name === "AbortError" || canceled) return;
        setError(err.message || "Strategist unavailable.");
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    };
    run();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [workspaceId, projectId, userId]);

  const handleRegenerate = async () => {
    if (!workspaceId || !userId) return;
    setRegenerating(true);
    try {
      const data = await regenerateStrategy(workspaceId, projectId, userId);
      setOverview(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to regenerate strategist.");
    } finally {
      setRegenerating(false);
    }
  };

  if (!workspaceId || !userId) {
    return <p className="text-sm text-slate-500">Select a workspace and sign in to view the strategist.</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading strategist…</p>;
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
        {error}
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="ml-3 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-white"
        >
          {regenerating ? "Refreshing…" : "Retry"}
        </button>
      </div>
    );
  }

  if (!overview) {
    return <p className="text-sm text-slate-500">Strategist data is not available.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Strategy overview</h2>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {regenerating ? "Refreshing…" : "Regenerate"}
        </button>
      </div>
      <StrategicSummaryCard summary={overview.summary} updatedAt={overview.updated_at} />
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <StrategicPillarsGrid pillars={overview.pillars} />
        <StrategicInsightFeed insights={overview.insights} />
      </div>
      <AskStrategistChat workspaceId={workspaceId} projectId={projectId} userId={userId} />
    </div>
  );
}
