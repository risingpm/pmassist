import { useEffect, useState } from "react";
import type { PRDVersionSummary } from "../api";
import { SURFACE_MUTED } from "../styles/theme";

type PRDVersionHistoryProps = {
  history: PRDVersionSummary[];
  loading?: boolean;
  selectedPrdId?: string;
  onSelectVersion?: (prdId: string) => void;
  onCompare?: (v1: number, v2: number) => void;
  onRebuildEmbeddings?: () => void;
  rebuildingEmbeddings?: boolean;
  className?: string;
};

export default function PRDVersionHistory({
  history,
  loading,
  selectedPrdId,
  onSelectVersion,
  onCompare,
  onRebuildEmbeddings,
  rebuildingEmbeddings,
  className,
}: PRDVersionHistoryProps) {
  const [selection, setSelection] = useState<number[]>([]);

  useEffect(() => {
    setSelection([]);
  }, [history]);

  const toggleSelection = (version: number) => {
    setSelection((prev) => {
      if (prev.includes(version)) {
        return prev.filter((v) => v !== version);
      }
      if (prev.length === 2) {
        return [prev[1], version];
      }
      return [...prev, version];
    });
  };

  const HistorySkeleton = ({ count = 5 }: { count?: number }) => (
    <div className="mt-4 space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className={`${SURFACE_MUTED} animate-pulse p-4`}>
          <div className="h-4 w-1/3 rounded-full bg-slate-200" />
          <div className="mt-2 h-3 w-full rounded-full bg-slate-100" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );

  const canCompare = selection.length === 2 && onCompare;

  return (
    <div className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Version history</p>
          <h3 className="text-lg font-semibold text-slate-900">All saved PRDs</h3>
        </div>
        <div className="flex items-center gap-2">
          {onRebuildEmbeddings && (
            <button
              type="button"
              onClick={onRebuildEmbeddings}
              disabled={rebuildingEmbeddings}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {rebuildingEmbeddings ? "Rebuilding…" : "Rebuild AI context"}
            </button>
          )}
          {canCompare && (
            <button
              type="button"
              onClick={() => onCompare?.(selection[0], selection[1])}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Compare {selection[0]} ↔ {selection[1]}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <HistorySkeleton />
      ) : history.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No versions saved yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {history.map((entry) => {
            const isSelected = selection.includes(entry.version);
            const isCurrent = selectedPrdId === entry.id;
            return (
              <li
                key={entry.id}
                className={`rounded-2xl border px-4 py-3 shadow-sm transition ${
                  isCurrent ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Version {entry.version} {entry.is_active && <span className="text-xs text-emerald-600">(active)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.feature_name || "Untitled"} · {new Date(entry.created_at).toLocaleString()}
                    </p>
                    {entry.author_name && <p className="text-xs text-slate-400">Authored by {entry.author_name}</p>}
                    {entry.decision_count > 0 && (
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        {entry.decision_count} decision{entry.decision_count === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelection(entry.version)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {isSelected ? "Selected" : "Compare"}
                    </button>
                    {onSelectVersion && (
                      <button
                        type="button"
                        onClick={() => onSelectVersion(entry.id)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
