import type { TemplateRecord } from "../../api";

export type TemplateGalleryProps = {
  templates: TemplateRecord[];
  onSelect?: (template: TemplateRecord) => void;
  onPrimaryAction?: (template: TemplateRecord) => void;
  selectedTemplateId?: string | null;
  emptyState?: string;
};

export function TemplateGallery({ templates, onSelect, onPrimaryAction, selectedTemplateId, emptyState }: TemplateGalleryProps) {
  if (templates.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        {emptyState || "No templates found for this view."}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {templates.map((template) => {
        const selected = selectedTemplateId === template.id;
        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect?.(template)}
            className={`group rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
              selected ? "border-blue-400 ring-2 ring-blue-300" : "border-slate-100"
            }`}
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
              <span>{template.category || "General"}</span>
              {template.is_recommended && <span className="text-emerald-500">Recommended</span>}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-900">{template.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm text-slate-500">{template.description || "No description"}</p>
            {template.tags && template.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {template.tags.slice(0, 4).map((tag) => (
                  <span key={`${template.id}-${tag}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
              <span>v{template.version}</span>
              <div className="flex gap-2">
                <span>{template.visibility === "system" ? "System" : template.visibility === "shared" ? "Shared" : "Private"}</span>
              </div>
            </div>
            {onPrimaryAction && (
              <div className="mt-5 flex">
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPrimaryAction(template);
                  }}
                >
                  Use template
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TemplateGallery;
