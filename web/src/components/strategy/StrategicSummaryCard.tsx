import type { StrategySummary } from "../../api";

interface StrategicSummaryCardProps {
  summary: StrategySummary;
  updatedAt?: string;
}

export default function StrategicSummaryCard({ summary, updatedAt }: StrategicSummaryCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">Strategic Summary</p>
      <h2 className="mt-2 text-2xl font-semibold">{summary.narrative || "No narrative yet."}</h2>
      {updatedAt && (
        <p className="mt-1 text-xs text-slate-400">Updated {new Date(updatedAt).toLocaleString()}</p>
      )}
      {summary.focus_areas?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Focus areas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.focus_areas.map((area) => (
              <span key={area} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                {area}
              </span>
            ))}
          </div>
        </div>
      )}
      {summary.forecast && (
        <div className="mt-4 text-sm text-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Forecast</p>
          <p className="mt-1">{summary.forecast}</p>
        </div>
      )}
      {summary.health_score != null && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Health</p>
          <div className="mt-1 h-2 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, (summary.health_score || 0) * 100))}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
