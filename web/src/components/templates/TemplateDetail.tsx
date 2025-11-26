import SafeMarkdown from "../SafeMarkdown";
import type { TemplateRecord, TemplateDetail } from "../../api";

export type TemplateDetailProps = {
  template: TemplateRecord | TemplateDetail | null;
  loading?: boolean;
  canEdit: boolean;
  onUse(template: TemplateRecord): void;
  onEdit(template: TemplateRecord): void;
  onDelete(template: TemplateRecord): void;
  onFork(template: TemplateRecord): void;
};

export function TemplateDetail({ template, loading, canEdit, onUse, onEdit, onDelete, onFork }: TemplateDetailProps) {
  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading template…</div>;
  }
  if (!template) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white/40 p-6 text-center text-sm text-slate-500">
        Select a template to preview its structure and actions.
      </div>
    );
  }

  const isSystem = template.visibility === "system";
  const latestContent = template.latest_version?.content || "";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Template</p>
          <h2 className="text-2xl font-semibold text-slate-900">{template.title}</h2>
          <p className="text-sm text-slate-500">{template.description || "No description provided."}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">{template.category || "General"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">Visibility: {template.visibility}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">v{template.version}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onUse(template)}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Use template
          </button>
          <button
            type="button"
            onClick={() => onFork(template)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Duplicate
          </button>
          {canEdit && !isSystem && (
            <>
              <button
                type="button"
                onClick={() => onEdit(template)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(template)}
                className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Preview</p>
        <div className="mt-3 max-h-[32rem] overflow-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          {latestContent ? <SafeMarkdown>{latestContent}</SafeMarkdown> : <p className="text-sm text-slate-500">No preview available.</p>}
        </div>
      </div>
      {template.tags && template.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {template.tags.map((tag) => (
            <span key={`${template.id}-tag-${tag}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default TemplateDetail;
