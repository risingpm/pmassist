import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  forkTemplate,
  applyTemplate,
  getTemplate,
} from "../../api";
import type { TemplateRecord, TemplateCreatePayload, TemplateUpdatePayload, TemplateDetail } from "../../api";
import { WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../../constants";
import { useUserRole } from "../../context/RoleContext";
import TemplateTagsFilter from "../../components/templates/TemplateTagsFilter";
import CreateTemplateModal from "../../components/templates/CreateTemplateModal";
import TemplatePreviewModal from "../../components/templates/TemplatePreviewModal";

export default function TemplateLibraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceRole } = useUserRole();
  const canEdit = workspaceRole === "admin" || workspaceRole === "editor";

  const queryWorkspace = useMemo(() => new URLSearchParams(location.search).get("workspace"), [location.search]);
  const [workspaceId] = useState(() => queryWorkspace || (typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_ID_KEY) : null));
  const workspaceName = useMemo(
    () => (typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_NAME_KEY) : "Workspace"),
    []
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [filters, setFilters] = useState<{ search?: string; category?: string; tag?: string | null; visibility?: string | null }>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDetail | TemplateRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setError("Select a workspace to manage templates.");
      return;
    }
    setLoading(true);
    listTemplates(workspaceId, filters)
      .then((data) => {
        setTemplates(data);
        setError(null);
      })
      .catch((err: any) => setError(err.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  }, [workspaceId, filters]);

  const handleCreate = async (payload: TemplateCreatePayload & { visibility?: string }) => {
    if (!workspaceId) return;
    const response = await createTemplate(workspaceId, payload);
    setTemplates((prev) => [response, ...prev]);
  };

  const handleUpdate = async (payload: TemplateUpdatePayload & { visibility?: string }) => {
    if (!workspaceId || !editingTemplate) return;
    const response = await updateTemplate(workspaceId, editingTemplate.id, payload);
    setTemplates((prev) => prev.map((tpl) => (tpl.id === response.id ? response : tpl)));
  };

  const handleDeleteTemplate = async (template: TemplateRecord) => {
    if (!workspaceId) return;
    if (!window.confirm(`Delete template "${template.title}"?`)) return;
    await deleteTemplate(workspaceId, template.id);
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== template.id));
    if (previewTemplate?.id === template.id) {
      setPreviewTemplate(null);
      setPreviewOpen(false);
    }
  };

  const handleFork = async (template: TemplateRecord) => {
    if (!workspaceId) return;
    const response = await forkTemplate(workspaceId, template.id, { visibility: "private" });
    setTemplates((prev) => [response, ...prev]);
    setNotice(`Duplicated “${template.title}”.`);
  };

  const handleUse = async (template: TemplateRecord) => {
    if (!workspaceId) return;
    try {
      const { version } = await applyTemplate(workspaceId, template.id);
      await navigator.clipboard?.writeText(version.content);
      setNotice("Template copied to clipboard.");
    } catch (err: any) {
      setError(err.message || "Unable to load template content");
    }
  };
  const openPreviewModal = useCallback(async (template: TemplateRecord) => {
    setPreviewOpen(true);
    if (!workspaceId) {
      setPreviewTemplate(template);
      return;
    }
    setPreviewLoading(true);
    try {
      const detail = await getTemplate(workspaceId, template.id);
      setPreviewTemplate(detail);
    } catch (err: any) {
      setError(err.message || "Failed to load template preview");
      setPreviewTemplate(template);
    } finally {
      setPreviewLoading(false);
    }
  }, [workspaceId]);

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewTemplate(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Template Library</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} templates</h1>
              <p className="text-sm text-slate-500">Curate reusable AI templates for PRDs, roadmaps, and plans.</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingTemplate(null);
                  setModalOpen(true);
                }}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm"
              >
                + New template
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <select
              value={filters.category ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value || undefined }))}
              className="rounded-full border border-slate-200 px-3 py-1"
            >
              <option value="">All categories</option>
              <option value="PRD">PRDs</option>
              <option value="Roadmap">Roadmaps</option>
              <option value="Sprint">Sprint plans</option>
            </select>
            <select
              value={filters.visibility ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, visibility: event.target.value || undefined }))}
              className="rounded-full border border-slate-200 px-3 py-1"
            >
              <option value="">All visibilities</option>
              <option value="system">System</option>
              <option value="shared">Shared</option>
              <option value="private">Private</option>
            </select>
            <input
              placeholder="Search templates"
              value={filters.search ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              className="rounded-full border border-slate-200 px-3 py-1"
            />
          </div>
          <TemplateTagsFilter templates={templates} activeTag={filters.tag ?? null} onSelect={(tag) => setFilters((prev) => ({ ...prev, tag }))} />
        </div>
        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {notice}
            <button onClick={() => setNotice(null)} className="ml-2 text-xs text-emerald-800">
              Dismiss
            </button>
          </div>
        )}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
            No templates yet. Create one to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Template</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Visibility</th>
                  <th className="px-4 py-3 text-left">Tags</th>
                  <th className="px-4 py-3 text-left">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openPreviewModal(template)}
                        className="text-left font-semibold text-slate-900 transition hover:text-blue-600"
                      >
                        {template.title}
                        {template.is_recommended && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Recommended
                          </span>
                        )}
                      </button>
                      <p className="text-xs text-slate-500">{template.description || "No description"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{template.category || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{template.visibility}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(template.tags || []).slice(0, 4).map((tag) => (
                          <span key={`${template.id}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            #{tag}
                          </span>
                        ))}
                        {template.tags && template.tags.length > 4 && (
                          <span className="text-xs text-slate-400">+{template.tags.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(template.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => openPreviewModal(template)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUse(template)}
                          className="rounded-full bg-slate-900 px-3 py-1 text-white transition hover:bg-slate-800"
                        >
                          Use
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTemplate(template);
                                setModalOpen(true);
                              }}
                              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFork(template)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-100"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(template)}
                              className="rounded-full border border-rose-200 px-3 py-1 text-rose-600 transition hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate(`/projects?workspace=${workspaceId ?? ""}`)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            ← Back to workspace
          </button>
          <button
            type="button"
            onClick={() => navigate(`/dashboard?workspace=${workspaceId ?? ""}`)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>

      {modalOpen && (
        <CreateTemplateModal
          open={modalOpen}
          mode={editingTemplate ? "edit" : "create"}
          initialValues={editingTemplate ?? undefined}
          onClose={() => setModalOpen(false)}
          onSave={async (values) => {
            if (editingTemplate) {
              await handleUpdate(values as TemplateUpdatePayload & { visibility?: string });
            } else {
              await handleCreate(values);
            }
          }}
        />
      )}

      <TemplatePreviewModal
        open={previewOpen}
        template={previewTemplate}
        loading={previewLoading}
        canEdit={canEdit}
        onClose={closePreview}
        onUse={handleUse}
        onEdit={(template) => {
          closePreview();
          setEditingTemplate(template);
          setModalOpen(true);
        }}
        onDelete={(template) => {
          closePreview();
          handleDeleteTemplate(template);
        }}
        onFork={(template) => handleFork(template)}
      />
    </div>
  );
}
