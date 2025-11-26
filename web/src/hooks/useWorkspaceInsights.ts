import { useCallback, useEffect, useState } from "react";
import {
  getWorkspaceInsights,
  regenerateWorkspaceInsights,
  type WorkspaceInsight,
} from "../api";

export default function useWorkspaceInsights(workspaceId: string | null, userId: string | null) {
  const [insight, setInsight] = useState<WorkspaceInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const refresh = useCallback(
    async (force = false): Promise<WorkspaceInsight | null> => {
      if (!workspaceId || !userId) {
        setInsight(null);
        setError("Select a workspace to load insights.");
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getWorkspaceInsights(workspaceId, userId, force);
        setInsight(data);
        return data;
      } catch (err: any) {
        setError(err.message || "Failed to load AI insight.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, userId]
  );

  const regenerate = useCallback(async (): Promise<WorkspaceInsight | null> => {
    if (!workspaceId || !userId) {
      setError("Select a workspace before refreshing insights.");
      return null;
    }
    setRegenerating(true);
    setError(null);
    try {
      const data = await regenerateWorkspaceInsights(workspaceId, userId);
      setInsight(data);
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to refresh AI insight.");
      return null;
    } finally {
      setRegenerating(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!workspaceId || !userId) {
      setInsight(null);
      return;
    }
    refresh(false);
  }, [workspaceId, userId, refresh]);

  return { insight, loading, error, refresh, regenerate, regenerating };
}
