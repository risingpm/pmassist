import { useCallback, useEffect, useState } from "react";
import { listTemplates, getTemplate } from "../../api";
import type { TemplateRecord, TemplateFilters, TemplateDetail } from "../../api";
import SafeMarkdown from "../SafeMarkdown";
import TemplateGallery from "./TemplateGallery";
import TemplateTagsFilter from "./TemplateTagsFilter";

export type TemplatePickerModalProps = {
  open: boolean;
  workspaceId: string | null;
  onClose(): void;
  onSelect(template: TemplateRecord): void;
};

export function TemplatePickerModal({ open, workspaceId, onClose, onSelect }: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<TemplateFilters>({});
  const [selected, setSelected] = useState<TemplateRecord | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(async (template: TemplateRecord) => {
    setSelected(template);
    if (!workspaceId) {
      setSelectedDetail(null);
      return;
    }
    try {
      const detail = await getTemplate(workspaceId, template.id);
      setSelectedDetail(detail);
    } catch (err) {
      console.warn("Failed to load template detail", err);
      setSelectedDetail(null);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return;
    if (!workspaceId) {
      setTemplates([]);
      setError("Select a workspace to browse templates.");
      setLoading(false);
      return;
    }
    setLoading(true);
    listTemplates(workspaceId, filters)
      .then((data) => {
        setTemplates(data);
        if (data.length) {
          const initial = selected && data.find((tpl) => tpl.id === selected.id) ? selected : data[0];
          if (initial) {
            handleSelect(initial);
          }
        } else {
          setSelected(null);
          setSelectedDetail(null);
        }
        setError(null);
      })
      .catch((err: any) => setError(err.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [open, workspaceId, filters, selected, handleSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Choose template</p>
            <h3 className="text-xl font-semibold text-slate-900">Template gallery</h3>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
            Close
          </button>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <select
              value={filters.category ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value || undefined }))}
              className="rounded-full border border-slate-200 px-3 py-1"
            >
              <option value="">All categories</option>
              <option value="PRD">PRDs</option>
              <option value="Roadmap">Roadmaps</option>
              <option value="Sprint">Sprints</option>
            </select>
            <input
              placeholder="Search templates"
              value={filters.search ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              className="rounded-full border border-slate-200 px-3 py-1"
            />
          </div>
          <TemplateTagsFilter
            templates={templates}
            activeTag={filters.tag ?? null}
            onSelect={(tag) => setFilters((prev) => ({ ...prev, tag: tag || undefined }))}
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Loading templates…
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[3fr,2fr]">
            <TemplateGallery
              templates={templates}
              onSelect={handleSelect}
              selectedTemplateId={selected?.id}
            />
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              {selectedDetail ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Preview</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">{selectedDetail.title}</h4>
                  <p className="text-sm text-slate-500">{selectedDetail.description}</p>
                  {selectedDetail.tags && selectedDetail.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      {selectedDetail.tags.map((tag) => (
                        <span key={`${selectedDetail.id}-tag-${tag}`} className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-sm">
                    {selectedDetail.latest_version?.content ? (
                      <SafeMarkdown>{selectedDetail.latest_version.content}</SafeMarkdown>
                    ) : (
                      <p className="text-slate-500">No preview available.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                  Select a template to preview its structure.
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
                onClose();
              }
            }}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Use template
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplatePickerModal;
