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
    <div className="space-y-4">
      <div className="md:hidden grid gap-4">
        {templates.map((template) => {
          const selected = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect?.(template)}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                selected ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                <span>{template.category || "General"}</span>
                {template.is_recommended && <span className="text-emerald-500">Recommended</span>}
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{template.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{template.description || "No description"}</p>
              {template.tags && template.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-500">
                  {template.tags.slice(0, 3).map((tag) => (
                    <span key={`${template.id}-mobile-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>v{template.version}</span>
                <span>{template.visibility === "system" ? "System" : template.visibility}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Visibility</th>
                {onPrimaryAction && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((template) => {
                const selected = selectedTemplateId === template.id;
                const visibilityLabel =
                  template.visibility === "system" ? "System" : template.visibility === "shared" ? "Shared" : "Private";
                return (
                  <tr
                    key={template.id}
                    onClick={() => onSelect?.(template)}
                    className={`cursor-pointer transition ${
                      selected ? "bg-slate-50 ring-1 ring-slate-200" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      {template.category || "General"}
                      {template.is_recommended && <span className="ml-2 text-emerald-500">Recommended</span>}
                    </td>
                    <td className="max-w-[280px] px-4 py-4">
                      <p className="truncate text-base font-semibold text-slate-900" title={template.title}>
                        {template.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500" title={template.description || undefined}>
                        {template.description || "No description"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(template.tags || []).slice(0, 3).map((tag) => (
                          <span key={`${template.id}-${tag}`} className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">v{template.version}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{visibilityLabel}</td>
                    {onPrimaryAction && (
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            onPrimaryAction(template);
                          }}
                        >
                          Use template
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TemplateGallery;
