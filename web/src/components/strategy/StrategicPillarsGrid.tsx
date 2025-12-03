import type { StrategicPillar } from "../../api";

interface StrategicPillarsGridProps {
  pillars: StrategicPillar[];
  onSelectLink?: (type: "prd" | "roadmap" | "task", id?: string | null) => void;
}

export default function StrategicPillarsGrid({ pillars, onSelectLink }: StrategicPillarsGridProps) {
  if (pillars.length === 0) {
    return <p className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">No pillars detected yet. Regenerate the strategist once workspace data exists.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {pillars.map((pillar) => (
        <article key={pillar.id} className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{pillar.title}</h3>
            <span className="text-xs font-semibold text-slate-500">{pillar.progress_percent.toFixed(0)}%</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">{pillar.description}</p>
          <div className="mt-4 space-y-3 text-sm">
            {pillar.related_prds.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">PRDs</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {pillar.related_prds.map((prd, idx) => (
                    <button
                      key={`${pillar.id}-prd-${idx}`}
                      type="button"
                      onClick={() => onSelectLink?.("prd", prd.id)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      {prd.title || "PRD"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pillar.related_roadmaps.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Roadmap</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {pillar.related_roadmaps.map((roadmap, idx) => (
                    <button
                      key={`${pillar.id}-roadmap-${idx}`}
                      type="button"
                      onClick={() => onSelectLink?.("roadmap", roadmap.id)}
                      className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    >
                      {roadmap.title || "Roadmap"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pillar.related_tasks.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Tasks</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {pillar.related_tasks.map((task, idx) => (
                    <button
                      key={`${pillar.id}-task-${idx}`}
                      type="button"
                      onClick={() => onSelectLink?.("task", task.id)}
                      className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {task.title || "Task"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
