import { SURFACE_MUTED } from "../styles/theme";

const MODULES = [
  { id: "knowledge", label: "Knowledge Base", description: "Use workspace documents & notes for context." },
  { id: "prd", label: "PRDs", description: "Reference recent PRD versions and decision notes." },
  { id: "roadmap", label: "Roadmap", description: "Access roadmap phases and milestones." },
  { id: "tasks", label: "Tasks", description: "Summarize Kanban tasks and blockers." },
];

type AgentToolSelectorProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

export default function AgentToolSelector({ value, onChange }: AgentToolSelectorProps) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((entry) => entry !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {MODULES.map((module) => (
        <button
          type="button"
          key={module.id}
          onClick={() => toggle(module.id)}
          aria-pressed={value.includes(module.id)}
          className={`${SURFACE_MUTED} flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
            value.includes(module.id)
              ? "border-blue-500 bg-blue-50/60 shadow-sm"
              : "border-slate-100 hover:border-slate-300"
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">{module.label}</p>
            <p className="text-xs text-slate-500">{module.description}</p>
          </div>
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
              value.includes(module.id)
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {value.includes(module.id) ? "✓" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
