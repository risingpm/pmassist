import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  forkTemplate,
  applyTemplate,
  getTemplate,
} from "../../api";
import type {
  TemplateRecord,
  TemplateCreatePayload,
  TemplateUpdatePayload,
  TemplateDetail,
  TemplateFilters,
} from "../../api";
import { SELECTED_PRD_TEMPLATE_KEY, WORKSPACE_ID_KEY } from "../../constants";
import { useUserRole } from "../../context/RoleContext";
import CreateTemplateModal from "../../components/templates/CreateTemplateModal";
import TemplatePreviewModal from "../../components/templates/TemplatePreviewModal";

const templateLibraryCloseIcon = "https://www.figma.com/api/mcp/asset/0214751f-4b24-45db-8d27-a1cb090f53a7";
const templateLibrarySearchIcon = "https://www.figma.com/api/mcp/asset/1967ffa4-9406-42a4-8dc7-4db74f40dfb1";

const CATEGORY_OPTIONS = [
  { label: "All Templates", value: null },
  { label: "Features", value: "feature" },
  { label: "Products", value: "product" },
  { label: "Strategy", value: "strategy" },
  { label: "Research", value: "research" },
] as const;

const FALLBACK_INCLUDES = ["Overview", "User Stories", "Requirements", "+2 more"];
const FALLBACK_BEST_FOR = ["New features", "Feature enhancements", "Sprint planning"];

export default function TemplateLibraryPage() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const { workspaceRole } = useUserRole();
  const canEdit = workspaceRole === "admin" || workspaceRole === "editor";

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  useEffect(() => {
    if (!routeWorkspaceId) return;
    setWorkspaceId(routeWorkspaceId);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, routeWorkspaceId);
    }
  }, [routeWorkspaceId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [filters, setFilters] = useState<TemplateFilters>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRecord | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDetail | TemplateRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const editingInitialValues = useMemo(() => {
    if (!editingTemplate) return undefined;
    const latestVersion = editingTemplate.latest_version;
    return {
      title: editingTemplate.title,
      description: editingTemplate.description ?? "",
      category: editingTemplate.category ?? "",
      visibility: editingTemplate.visibility,
      tags: editingTemplate.tags ?? [],
      content: latestVersion?.content ?? "",
      content_format: latestVersion?.content_format ?? "markdown",
      metadata: latestVersion?.metadata ?? null,
    };
  }, [editingTemplate]);
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
  };

  const handleUse = async (template: TemplateRecord) => {
    if (!workspaceId) {
      setError("Select a workspace to use templates.");
      return;
    }
    try {
      await applyTemplate(workspaceId, template.id);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SELECTED_PRD_TEMPLATE_KEY, template.id);
      }
      setPreviewOpen(false);
      setPreviewTemplate(null);
      navigate(`/workspaces/${workspaceId}/prd/new?templateId=${template.id}`);
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

  const filteredTemplates = useMemo(() => {
    const searchValue = (filters.search ?? "").trim().toLowerCase();
    const categoryValue = (filters.category ?? "").trim().toLowerCase();
    return templates.filter((template) => {
      const matchesSearch =
        !searchValue ||
        template.title.toLowerCase().includes(searchValue) ||
        (template.description || "").toLowerCase().includes(searchValue) ||
        (template.tags || []).some((tag) => tag.toLowerCase().includes(searchValue));
      const matchesCategory =
        !categoryValue || (template.category || "").toLowerCase().includes(categoryValue);
      return matchesSearch && matchesCategory;
    });
  }, [templates, filters.category, filters.search]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    CATEGORY_OPTIONS.forEach((option) => counts.set(option.value, 0));
    templates.forEach((template) => {
      const categoryValue = (template.category || "").toLowerCase();
      counts.set(null, (counts.get(null) || 0) + 1);
      CATEGORY_OPTIONS.slice(1).forEach((option) => {
        if (option.value && categoryValue.includes(option.value)) {
          counts.set(option.value, (counts.get(option.value) || 0) + 1);
        }
      });
    });
    return counts;
  }, [templates]);

  return (
    <div className="min-h-screen bg-[rgba(0,0,0,0.5)] px-6 py-10">
      <div className="mx-auto flex h-[787.5px] w-full max-w-[1152px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="border-b border-[#e5e7eb]">
          <div className="flex flex-col gap-4 px-6 pb-px pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[24px] font-bold leading-[32px] tracking-[0.0703px] text-[#101828]">Template Library</p>
                <p className="text-[14px] text-[#6a7282]">
                  Choose a template to structure your PRD and get started faster
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-8 w-9 items-center justify-center rounded-[8px]"
              >
                <img alt="Close" className="h-4 w-4" src={templateLibraryCloseIcon} />
              </button>
            </div>
            <div className="relative h-9 w-full">
              <input
                placeholder="Search templates..."
                value={filters.search ?? ""}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] pl-10 pr-3 text-[14px] tracking-[-0.1504px] text-[#101828] placeholder:text-[#717182]"
              />
              <img alt="" className="absolute left-3 top-2.5 h-4 w-4" src={templateLibrarySearchIcon} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="h-full w-[224px] border-r border-[#e5e7eb] px-4 pb-4 pt-4">
            <p className="px-2 text-[14px] font-semibold text-[#101828]">Categories</p>
            <div className="mt-3 flex flex-col gap-1">
              {CATEGORY_OPTIONS.map((option) => {
                const active = (filters.category ?? null) === option.value;
                const count = categoryCounts.get(option.value) ?? 0;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, category: option.value ?? undefined }))}
                    className={`flex h-9 items-center justify-between rounded-[10px] px-3 text-[14px] font-medium ${
                      active ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="text-[12px] text-[#99a1af]">{count}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-h-0 flex-1 overflow-y-auto px-6 pb-0 pt-6">
            {error && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
            )}
            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Loading templates…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredTemplates.map((template) => {
                  const tags = template.tags || [];
                  const includes = tags.length ? tags.slice(0, 4) : FALLBACK_INCLUDES;
                  const bestFor = tags.length > 4 ? tags.slice(4, 7) : FALLBACK_BEST_FOR;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => openPreviewModal(template)}
                      className="flex flex-col gap-10 rounded-[14px] border border-[rgba(0,0,0,0.1)] bg-white px-[25px] py-[25px] text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-[10px] bg-gradient-to-br from-[#f3e8ff] to-[#dbeafe] p-3">
                          <div className="h-5 w-5 rounded-full bg-[#c084fc]" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[18px] font-semibold text-[#101828]">{template.title}</p>
                            {template.is_recommended && (
                              <span className="rounded-full bg-gradient-to-r from-[#ad46ff] to-[#2b7fff] px-2 py-0.5 text-[12px] font-medium text-white">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#6a7282]">{(template.category || "feature").toLowerCase()}</p>
                        </div>
                      </div>
                      <p className="text-[14px] leading-[20px] text-[#4a5565]">
                        {template.description || "Standard template for building a new product feature with user stories and requirements"}
                      </p>
                      <div>
                        <p className="text-[12px] font-medium text-[#364153]">Includes:</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {includes.map((tag) => (
                            <span key={`${template.id}-include-${tag}`} className="rounded-[4px] bg-[#f3f4f6] px-2 py-1 text-[12px] text-[#4a5565]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-[#f3f4f6] pt-4">
                        <p className="text-[12px] text-[#6a7282]">Best for:</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#4a5565]">
                          {bestFor.map((item) => (
                            <span key={`${template.id}-best-${item}`}>• {item}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-[#e5e7eb] bg-[#f9fafb] px-4 py-4 text-center text-[12px] text-[#6a7282]">
          Can't find what you're looking for? Start with a blank template and customize it to your needs
        </div>
      </div>

      {modalOpen && (
        <CreateTemplateModal
          open={modalOpen}
          mode={editingTemplate ? "edit" : "create"}
          initialValues={editingInitialValues}
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
