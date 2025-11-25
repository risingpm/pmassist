import TemplateDetail from "./TemplateDetail";
import type { TemplateRecord, TemplateDetail as TemplateDetailType } from "../../api";

export type TemplatePreviewModalProps = {
  open: boolean;
  template: TemplateRecord | TemplateDetailType | null;
  loading?: boolean;
  canEdit: boolean;
  onClose(): void;
  onUse(template: TemplateRecord): void;
  onEdit(template: TemplateRecord): void;
  onDelete(template: TemplateRecord): void;
  onFork(template: TemplateRecord): void;
};

export default function TemplatePreviewModal({
  open,
  template,
  loading = false,
  canEdit,
  onClose,
  onUse,
  onEdit,
  onDelete,
  onFork,
}: TemplatePreviewModalProps) {
  if (!open) return null;

  const content = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Loading template…
        </div>
      );
    }
    if (!template) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Select a template to preview its structure.
        </div>
      );
    }
    return (
      <TemplateDetail
        template={template}
        loading={false}
        canEdit={canEdit}
        onUse={onUse}
        onEdit={onEdit}
        onDelete={onDelete}
        onFork={onFork}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Template preview</p>
            <h3 className="text-xl font-semibold text-slate-900">{template?.title ?? "Preview"}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600"
          >
            Close
          </button>
        </div>
        {content()}
      </div>
    </div>
  );
}
