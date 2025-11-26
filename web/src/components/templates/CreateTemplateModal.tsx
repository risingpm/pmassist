import { useEffect, useState } from "react";
import type { TemplateCreatePayload, TemplateVisibility, TemplateFormat } from "../../api";

export type CreateTemplateModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<TemplateCreatePayload> & { visibility?: TemplateVisibility };
  onClose(): void;
  onSave(values: TemplateCreatePayload & { visibility?: TemplateVisibility }): Promise<void>;
};

const defaultValues: TemplateCreatePayload & { visibility: TemplateVisibility } = {
  title: "",
  description: "",
  category: "",
  visibility: "private",
  tags: [],
  content: "",
  content_format: "markdown",
  metadata: null,
};

export function CreateTemplateModal({ open, mode, initialValues, onClose, onSave }: CreateTemplateModalProps) {
  const [values, setValues] = useState(defaultValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues({ ...defaultValues, ...initialValues } as typeof defaultValues);
      setError(null);
      setSaving(false);
    }
  }, [open, initialValues]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof TemplateCreatePayload | "visibility") =>
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
    };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              {mode === "create" ? "New template" : "Edit template"}
            </p>
            <h3 className="text-xl font-semibold text-slate-900">
              {mode === "create" ? "Create template" : `Edit ${initialValues?.title ?? "template"}`}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">Title</label>
            <input
              value={values.title}
              onChange={updateField("title")}
              required
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Description</label>
            <textarea
              value={values.description ?? ""}
              onChange={updateField("description")}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
              rows={2}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700">Category</label>
              <input
                value={values.category ?? ""}
                onChange={updateField("category")}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Visibility</label>
              <select
                value={values.visibility}
                onChange={updateField("visibility")}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Tags (comma separated)</label>
            <input
              value={(values.tags || []).join(", ")}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))
              }
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Template content</label>
            <textarea
              value={values.content}
              onChange={updateField("content")}
              required
              rows={10}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Format</label>
            <select
              value={values.content_format as TemplateFormat}
              onChange={updateField("content_format")}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
            >
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "create" ? "Create template" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateTemplateModal;
