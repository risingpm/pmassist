import { useEffect, useState } from "react";
import {
  applyRoadmapAIUpdates,
  getRoadmapSuggestions,
  type RoadmapReprioritizeSuggestion,
} from "../../api";

type ReprioritizeSuggestionsProps = {
  projectId: string;
  workspaceId: string | null;
  refreshKey: number;
  onApplied: () => void;
};

export default function ReprioritizeSuggestions({
  projectId,
  workspaceId,
  refreshKey,
  onApplied,
}: ReprioritizeSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<RoadmapReprioritizeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await getRoadmapSuggestions(projectId, workspaceId);
      setSuggestions(data);
      setError(null);
    } catch (err: any) {
      setSuggestions([]);
      setError(err.message || "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, [refreshKey, workspaceId]);

  const handleAccept = async (suggestion: RoadmapReprioritizeSuggestion) => {
    if (!workspaceId || suggestion.updates.length === 0) return;
    setApplying(suggestion.suggestion_id);
    try {
      await applyRoadmapAIUpdates(projectId, workspaceId, suggestion.updates);
      setSuggestions((prev) => prev.filter((item) => item.suggestion_id !== suggestion.suggestion_id));
      onApplied();
    } catch (err: any) {
      setError(err.message || "Failed to apply suggestion");
    } finally {
      setApplying(null);
    }
  };

  const handleReject = (suggestionId: string) => {
    setSuggestions((prev) => prev.filter((item) => item.suggestion_id !== suggestionId));
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">AI Insights</p>
          <h3 className="text-lg font-semibold text-slate-900">Reprioritization suggestions</h3>
        </div>
        <button
          type="button"
          onClick={loadSuggestions}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      {error && <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-xs text-rose-600">{error}</p>}
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Analyzing roadmap…</p>
      ) : suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No AI suggestions at the moment.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {suggestions.map((suggestion) => (
            <li key={suggestion.suggestion_id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    {suggestion.impact || "Suggestion"}
                  </p>
                  <h4 className="text-base font-semibold text-slate-900">{suggestion.title}</h4>
                </div>
                <div className="flex gap-2 text-xs">
                  {suggestion.recommended_phase_id && (
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">Phase change</span>
                  )}
                  {suggestion.recommended_order_index !== null && suggestion.recommended_order_index !== undefined && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      Order → {suggestion.recommended_order_index + 1}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{suggestion.summary}</p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleAccept(suggestion)}
                  disabled={applying === suggestion.suggestion_id}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {applying === suggestion.suggestion_id ? "Applying…" : "Accept"}
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(suggestion.suggestion_id)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
