import type { KnowledgeBaseContextItem } from "../api";

type ContextUsedPanelProps = {
  entries: KnowledgeBaseContextItem[];
  label?: string;
};

export default function ContextUsedPanel({ entries, label = "Context used" }: ContextUsedPanelProps) {
  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl bg-white/60 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{entry.title}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {entry.type}
              </span>
            </div>
            {entry.snippet && (
              <p className="mt-1 text-xs text-slate-500">
                {entry.snippet.length > 280 ? `${entry.snippet.slice(0, 280)}…` : entry.snippet}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
