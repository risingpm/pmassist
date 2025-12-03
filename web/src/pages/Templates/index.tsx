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
  getProjects,
  createPrd,
} from "../../api";
import type {
  TemplateRecord,
  TemplateCreatePayload,
  TemplateUpdatePayload,
  TemplateDetail,
  TemplateFilters,
  TemplateVisibility,
} from "../../api";
import { WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, WIDE_PAGE_CONTAINER } from "../../constants";
import { useUserRole } from "../../context/RoleContext";
import TemplateTagsFilter from "../../components/templates/TemplateTagsFilter";
import CreateTemplateModal from "../../components/templates/CreateTemplateModal";
import TemplatePreviewModal from "../../components/templates/TemplatePreviewModal";
import TemplateLibrary from "../../components/templates/TemplateLibrary";
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, BODY_SUBTLE } from "../../styles/theme";

type WorkspaceProject = {
  id: string;
  title: string;
};

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
  const workspaceName = useMemo(
    () => (typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_NAME_KEY) : "Workspace"),
    []
  );
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
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDetail | TemplateRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [usingTemplateId, setUsingTemplateId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      return;
    }
    setProjectsLoading(true);
    getProjects(workspaceId)
      .then((data) => {
        setProjects((data.projects || []).map((project: any) => ({ id: project.id, title: project.title })));
        setProjectError(null);
      })
      .catch((err: any) => setProjectError(err.message || "Create a project to use templates with AI."))
      .finally(() => setProjectsLoading(false));
  }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId || projectsLoading) return;
    if (projects.length === 0) {
      setProjectError("Create a project to send templates to AI.");
    } else {
      setProjectError(null);
    }
  }, [workspaceId, projects, projectsLoading]);

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
  const handleUseWithAI = async (template: TemplateRecord) => {
    if (!workspaceId) {
      setError("Select a workspace to use templates.");
      return;
    }
    if (!projects.length) {
      setError("Create a project to use templates with AI.");
      return;
    }
    const targetProject = projects[0];
    setUsingTemplateId(template.id);
    try {
      await createPrd(targetProject.id, workspaceId, {
        feature_name: template.title,
        prompt: `Generate a PRD draft using the ${template.title} template.`,
        template_id: template.id,
      });
      setNotice(`PRD draft created from “${template.title}”.`);
      navigate(`/workspaces/${workspaceId}/projects/detail/${targetProject.id}/prd`);
    } catch (err: any) {
      setError(err.message || "Failed to use template with AI");
    } finally {
      setUsingTemplateId(null);
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

  const navItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Knowledge", path: `/workspaces/${workspaceId}/knowledge`, active: false },
      { label: "Templates", path: `/workspaces/${workspaceId}/templates`, active: true },
    ];
  }, [workspaceId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8`}>
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={SECTION_LABEL}>Template library</p>
            <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} templates</h1>
            <p className={BODY_SUBTLE}>Curate reusable AI templates for PRDs, roadmaps, and execution plans.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(workspaceId ? `/workspaces/${workspaceId}/projects` : "/projects")}
              className={SECONDARY_BUTTON}
            >
              View projects
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingTemplate(null);
                  setModalOpen(true);
                }}
                className={PRIMARY_BUTTON}
              >
                New template
              </button>
            )}
          </div>
        </header>

        {navItems.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className={`rounded-full px-4 py-2 ${
                  item.active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <select
              value={filters.visibility ?? ""}
              onChange={(event) => {
                const next = event.target.value as TemplateVisibility | "";
                setFilters((prev) => ({ ...prev, visibility: next ? (next as TemplateVisibility) : null }));
              }}
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
        {projectError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">{projectError}</div>
        )}
        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Loading templates…</div>
        ) : (
          <TemplateLibrary
            templates={templates}
            activeCategory={filters.category ?? null}
            onCategoryChange={(category) => setFilters((prev) => ({ ...prev, category: category || undefined }))}
            onPreview={openPreviewModal}
            onUseWithAI={handleUseWithAI}
            pendingTemplateId={usingTemplateId}
          />
        )}
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
