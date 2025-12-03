import type { TemplateRecord } from "../../api";

const CATEGORY_TABS: Array<{ label: string; value: string | null }> = [
  { label: "All", value: null },
  { label: "PRDs", value: "PRD" },
  { label: "Roadmaps", value: "Roadmap" },
  { label: "Sprint Plans", value: "Sprint" },
  { label: "Launch Checklists", value: "Launch" },
];

type TemplateLibraryProps = {
  templates: TemplateRecord[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  onPreview: (template: TemplateRecord) => void;
  onUseWithAI: (template: TemplateRecord) => void;
  pendingTemplateId?: string | null;
};

export default function TemplateLibrary({
  templates,
  activeCategory,
  onCategoryChange,
  onPreview,
  onUseWithAI,
  pendingTemplateId = null,
}: TemplateLibraryProps) {
  const filtered =
    activeCategory && activeCategory.length > 0
      ? templates.filter((tpl) => (tpl.category || "").toLowerCase().includes(activeCategory.toLowerCase()))
      : templates;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => {
          const active = (tab.value || null) === (activeCategory || null);
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => onCategoryChange(tab.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
          No templates match this view.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((template) => (
            <div key={template.id} className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {template.category || "General"}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">{template.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{template.description || "No description provided."}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  {(template.tags || []).slice(0, 4).map((tag) => (
                    <span key={`${template.id}-tag-${tag}`} className="rounded-full bg-slate-100 px-3 py-0.5 font-semibold">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onPreview(template)}
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => onUseWithAI(template)}
                  disabled={pendingTemplateId === template.id}
                  className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingTemplateId === template.id ? "Generating…" : "Use with AI"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
