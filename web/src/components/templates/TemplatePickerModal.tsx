import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<"list" | "preview">("list");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = useCallback(async (template: TemplateRecord) => {
    setSelected(template);
    setStage("preview");
    if (!workspaceId) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await getTemplate(workspaceId, template.id);
      setSelectedDetail(detail);
    } catch (err) {
      console.warn("Failed to load template detail", err);
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
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
        if (!data.length) {
          setSelected(null);
          setSelectedDetail(null);
          setStage("list");
        } else if (stage === "preview" && selected && !data.find((tpl) => tpl.id === selected.id)) {
          setSelected(null);
          setSelectedDetail(null);
          setStage("list");
        }
        setError(null);
      })
      .catch((err: any) => setError(err.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [open, workspaceId, filters, stage, selected]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setStage("list");
      setSelected(null);
      setSelectedDetail(null);
      setDetailLoading(false);
    }
  }, [open]);

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Choose template</p>
            <h3 className="text-xl font-semibold text-slate-900">Template gallery</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
          {stage === "list" ? (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                  <label className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</span>
                    <select
                      value={filters.category ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value || undefined }))}
                      className="bg-transparent text-slate-700 focus:outline-none"
                    >
                      <option value="">All</option>
                      <option value="PRD">PRDs</option>
                      <option value="Roadmap">Roadmaps</option>
                      <option value="Sprint">Sprints</option>
                    </select>
                  </label>
                  <input
                    placeholder="Search templates"
                    value={filters.search ?? ""}
                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                    className="w-48 rounded-full border border-slate-200 px-4 py-1 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none md:w-64"
                  />
                </div>
                <div className="overflow-x-auto">
                  <TemplateTagsFilter
                    templates={templates}
                    activeTag={filters.tag ?? null}
                    onSelect={(tag) => setFilters((prev) => ({ ...prev, tag: tag || undefined }))}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              {loading ? (
                <div className="flex flex-1 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 p-10 text-sm text-slate-500">
                  Loading templates…
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto pr-2">
                    <TemplateGallery
                      templates={templates}
                      onSelect={loadDetail}
                      selectedTemplateId={selected?.id}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStage("list");
                    setSelectedDetail(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  ← Back to templates
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
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Use template
                </button>
              </div>
              <div className="flex-1 overflow-hidden rounded-[28px] border border-slate-100 bg-slate-50/70 p-6 shadow-inner">
                {detailLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading preview…</div>
                ) : selected ? (
                  <div className="flex h-full flex-col gap-4 overflow-hidden">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{selected.category || "Template"}</p>
                      <h4 className="mt-2 text-2xl font-bold text-slate-900">{selectedDetail?.title || selected.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{selectedDetail?.description || selected.description || "No description available."}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        {(selectedDetail?.tags || selected.tags || []).map((tag) => (
                          <span key={`${selected.id}-preview-${tag}`} className="rounded-full bg-white px-3 py-1 font-semibold text-slate-600">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                        <span>v{selected.version}</span>
                        <span className="ml-4">{selected.visibility === "system" ? "System" : selected.visibility}</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto rounded-2xl border border-slate-100 bg-white/90 p-4 text-sm">
                      {selectedDetail?.latest_version?.content ? (
                        <SafeMarkdown>{selectedDetail.latest_version.content}</SafeMarkdown>
                      ) : (
                        <p className="text-slate-500">No preview available for this template.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a template to preview.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default TemplatePickerModal;
