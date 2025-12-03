import { useCallback, useEffect, useMemo, useState } from "react";
import { getPrds, createPrd, deletePrd } from "../api";
import type { ProjectRole, KnowledgeBaseContextItem, PRDRecord, TemplateRecord, VerificationDetails } from "../api";
import ContextUsedPanel from "./ContextUsedPanel";
import TemplatePickerModal from "./templates/TemplatePickerModal";
import VerificationNotice from "./VerificationNotice";
import {
  SURFACE_CARD,
  SURFACE_MUTED,
  SECTION_LABEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  PILL_META,
  BODY_SUBTLE,
} from "../styles/theme";

type PRDListProps = {
  projectId: string;
  workspaceId: string | null;
  projectRole: ProjectRole;
  onSelectPrd: (projectId: string, prdId: string) => void;
  onBack: () => void;
};

export default function PRDList({
  projectId,
  workspaceId,
  projectRole,
  onSelectPrd,
  onBack,
}: PRDListProps) {
  const [prds, setPrds] = useState<PRDRecord[]>([]);
  const [prdsLoading, setPrdsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);
  const [verification, setVerification] = useState<VerificationDetails | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);

  // new state for form
  const [featureName, setFeatureName] = useState("");
  const [prompt, setPrompt] = useState("");
  const canEdit = projectRole === "owner" || projectRole === "contributor";

  const loadPrds = useCallback(async () => {
    if (!workspaceId) {
      setError("Workspace not available. Return to projects and choose a workspace.");
      return;
    }
    setPrdsLoading(true);
    try {
      const data = await getPrds(projectId, workspaceId);
      setPrds(data || []);
      if (data && data.length > 0) {
        setContextEntries(data[0].context_entries ?? []);
        setVerification(data[0].verification ?? null);
      } else {
        setContextEntries([]);
        setVerification(null);
      }
      setError(null);
    } catch (err) {
      console.error("Failed to load PRDs:", err);
      setError("❌ Failed to load PRDs");
    } finally {
      setPrdsLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    loadPrds();
  }, [loadPrds]);

  // Handle Generate via form
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    setSubmitting(true);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      const created = await createPrd(projectId, workspaceId, {
        feature_name: featureName,
        prompt,
        template_id: selectedTemplate?.id ?? null,
      });
      setContextEntries(created.context_entries ?? []);
      setVerification(created.verification ?? null);
      setFeatureName("");
      setPrompt("");
      setSelectedTemplate(null);
      await loadPrds();
      setError(null);
      setSuccess("✅ PRD generated successfully");
    } catch (err) {
      console.error("Failed to generate PRD:", err);
      setError("❌ Failed to generate PRD");
      setSuccess(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (prdId: string) => {
    if (!canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to delete this PRD?");
    if (!confirmed) return;

    setDeletingId(prdId);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      await deletePrd(projectId, prdId, workspaceId);
      await loadPrds();
      setError(null);
      setSuccess("🗑️ PRD deleted successfully");
    } catch (err) {
      console.error("Failed to delete PRD:", err);
      setError("❌ Failed to delete PRD");
      setSuccess(null);
    } finally {
      setDeletingId(null);
    }
  };

  const totalDocs = prds.length;
  const lastUpdatedAt = useMemo(() => {
    if (prds.length === 0) return null;
    return prds
      .map((doc) => new Date(doc.updated_at).getTime())
      .reduce((max, ts) => Math.max(max, ts), 0);
  }, [prds]);
  const hasContextInsights = (contextEntries?.length ?? 0) > 0 || Boolean(verification);
  const lastUpdatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "No documents yet";

  return (
    <div className="flex min-h-[calc(100vh-220px)] flex-col gap-6">
      <header className={`${SURFACE_CARD} flex flex-wrap items-center justify-between gap-4 px-6 py-5`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={SECONDARY_BUTTON}>
            ⬅ Back
          </button>
          <div>
            <p className={SECTION_LABEL}>Product requirements</p>
            <h1 className="text-2xl font-semibold text-slate-900">PRD workspace</h1>
            <p className={BODY_SUBTLE}>Autosave versions, capture decisions, and keep AI context aligned.</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          <span className={PILL_META}>{totalDocs} docs</span>
          <span className="text-[11px] normal-case">Last update · {lastUpdatedLabel}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {error && <span className="rounded-full bg-rose-50 px-4 py-1 text-rose-600">{error}</span>}
        {success && <span className="rounded-full bg-emerald-50 px-4 py-1 text-emerald-600">{success}</span>}
        {!workspaceId && (
          <span className="rounded-full bg-amber-50 px-4 py-1 text-amber-600">
            Workspace context missing. Please re-open the project.
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1.2fr]">
        <section className={`${SURFACE_CARD} flex min-h-[520px] flex-col`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className={SECTION_LABEL}>Create & iterate</p>
              <h2 className="text-xl font-semibold text-slate-900">Generate with AI</h2>
              <p className={BODY_SUBTLE}>
                Describe what you need and PM Assist drafts a versioned PRD with embeddings ready to query.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              disabled={!canEdit}
              className={SECONDARY_BUTTON}
            >
              {selectedTemplate ? "Switch template" : "Pick template"}
            </button>
          </div>
          <form onSubmit={handleGenerate} className="flex flex-1 flex-col gap-4 px-6 py-5">
            <label className="text-sm font-semibold text-slate-700">
              Feature name
              <input
                type="text"
                value={featureName}
                onChange={(e) => setFeatureName(e.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 shadow-inner focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                placeholder="e.g. Usage analytics dashboard"
                disabled={!canEdit}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Prompt / description
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
                className="mt-2 h-32 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-inner focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                placeholder="Outline goals, constraints, target personas, or paste a Notion doc…"
                disabled={!canEdit}
              />
            </label>
            <div className={`${SURFACE_MUTED} border-dashed p-4 text-sm text-slate-600`}>
              {selectedTemplate ? (
                <div className="space-y-1">
                  <p className={SECTION_LABEL}>Template</p>
                  <p className="text-base font-semibold text-slate-900">{selectedTemplate.title}</p>
                  <p className="text-sm text-slate-500 line-clamp-3">{selectedTemplate.description}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Clear template
                  </button>
                </div>
              ) : (
                <p className="text-sm">
                  Optionally choose a template to enforce structure. Your workspace’s library now lives under the Work
                  section in the sidebar.
                </p>
              )}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !canEdit}
                className={PRIMARY_BUTTON}
              >
                {submitting ? "Generating…" : "Generate PRD"}
              </button>
              {!canEdit && (
                <span className="text-xs text-slate-500">Viewer access cannot create or refine PRDs.</span>
              )}
            </div>
          </form>
        </section>

        <section className={`${SURFACE_CARD} flex min-h-[520px] flex-col`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className={SECTION_LABEL}>Existing docs</p>
              <h2 className="text-xl font-semibold text-slate-900">Version history at a glance</h2>
              <p className={BODY_SUBTLE}>
                Open any PRD to explore timeline, diffs, decision notes, and AI Q&A.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPrds}
              disabled={prdsLoading}
              className={SECONDARY_BUTTON}
            >
              {prdsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {hasContextInsights && (
            <div className="space-y-3 px-6 py-4">
              <VerificationNotice verification={verification} />
              <ContextUsedPanel entries={contextEntries} label="Latest AI context" />
            </div>
          )}
          <div className="flex-1 overflow-hidden px-6 pb-6">
            {prdsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading PRDs…
              </div>
            ) : prds.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-500">
                <p>No PRDs yet.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Use the generator on the left to create your first versioned document.
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-3 overflow-auto pr-2">
                {prds.map((prd) => (
                  <article
                    key={prd.id}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          v{prd.version} · {new Date(prd.updated_at).toLocaleDateString()}
                        </p>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {prd.feature_name || `PRD ${prd.version}`}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                          {prd.description || "No summary provided yet."}
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold">
                          {new Date(prd.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <button
                        onClick={() => onSelectPrd(projectId, prd.id)}
                        className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        Open PRD
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => handleDelete(prd.id)}
                          disabled={deletingId === prd.id}
                          className="rounded-full border border-rose-200 px-4 py-2 font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          {deletingId === prd.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <TemplatePickerModal
        open={templateModalOpen}
        workspaceId={workspaceId}
        onClose={() => setTemplateModalOpen(false)}
        onSelect={(template) => setSelectedTemplate(template)}
      />
    </div>
  );
}
