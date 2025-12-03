import type { StrategicInsight } from "../../api";

interface StrategicInsightFeedProps {
  insights: StrategicInsight[];
}

export default function StrategicInsightFeed({ insights }: StrategicInsightFeedProps) {
  if (insights.length === 0) {
    return <p className="rounded-3xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No insights yet.</p>;
  }
  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <article key={insight.id} className="rounded-3xl border border-slate-100 bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{insight.severity || "info"}</p>
              <h4 className="text-base font-semibold text-slate-900">{insight.title}</h4>
            </div>
            {insight.impact_score != null && (
              <span className="text-xs font-semibold text-slate-500">Impact {(insight.impact_score * 100).toFixed(0)}%</span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">{insight.description}</p>
          {insight.suggested_action && (
            <p className="mt-2 text-xs font-semibold text-blue-600">Action: {insight.suggested_action}</p>
          )}
        </article>
      ))}
    </div>
  );
}
