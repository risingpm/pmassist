import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPrd,
  refinePrd,
  exportPrd,
  deletePrd,
  savePrdVersion,
  getPrdHistory,
  comparePrdVersions,
  askPrdQuestion,
  rebuildPrdEmbeddings,
  type ProjectRole,
  type KnowledgeBaseContextItem,
  type PRDRecord,
  type VerificationDetails,
  type PRDVersionSummary,
  type PRDDiffResponse,
} from "../api";
import ContextUsedPanel from "./ContextUsedPanel";
import VerificationNotice from "./VerificationNotice";
import PRDVersionHistory from "./PRDVersionHistory";
import PRDDiffView from "./PRDDiffView";
import PRDQAPanel from "./PRDQAPanel";
import DecisionNotes from "./DecisionNotes";
import SafeMarkdown from "./SafeMarkdown";
import {
  SURFACE_CARD,
  SECTION_LABEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  PILL_META,
  BODY_SUBTLE,
} from "../styles/theme";

type PRDDetailProps = {
  projectId: string;
  prdId: string;
  workspaceId: string | null;
  projectRole: ProjectRole;
  onBack: () => void;
  initialSidePanel?: "assist" | "history";
  focusSection?: "decision";
};

export default function PRDDetail({
  projectId,
  prdId,
  workspaceId,
  projectRole,
  onBack,
  initialSidePanel,
  focusSection,
}: PRDDetailProps) {
  const [activePrdId, setActivePrdId] = useState(prdId);
  const [prd, setPrd] = useState<PRDRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PRDVersionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);
  const [verification, setVerification] = useState<VerificationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [diff, setDiff] = useState<PRDDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  const [summarizingDiff, setSummarizingDiff] = useState(false);
  const [rebuildingEmbeddings, setRebuildingEmbeddings] = useState(false);
  const [sidePanel, setSidePanel] = useState<"assist" | "history">(initialSidePanel ?? "assist");
  const canEdit = projectRole === "owner" || projectRole === "contributor";
  const decisionFocusHandledRef = useRef(false);
  const decisionNotesAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActivePrdId(prdId);
  }, [prdId]);

  useEffect(() => {
    if (!workspaceId) return;
    setHistoryLoading(true);
    getPrdHistory(projectId, workspaceId)
      .then(setHistory)
      .catch((err) => setError(err.message || "Failed to load history"))
      .finally(() => setHistoryLoading(false));
  }, [projectId, workspaceId]);

  useEffect(() => {
    const fetchPrd = async () => {
      if (!workspaceId) {
        setError("Workspace context missing. Go back and select a workspace.");
        return;
      }
      setLoading(true);
      try {
        const data = await getPrd(projectId, activePrdId, workspaceId);
        setPrd(data);
        setEditableContent(data.content || "");
        setContextEntries(data.context_entries ?? []);
        setVerification(data.verification ?? null);
        setError(null);
      } catch (err) {
        console.error("Failed to load PRD:", err);
        setError("⚠️ Failed to load PRD");
      } finally {
        setLoading(false);
      }
    };
    fetchPrd();
  }, [projectId, activePrdId, workspaceId]);

  useEffect(() => {
    if (!initialSidePanel) return;
    setSidePanel(initialSidePanel);
  }, [initialSidePanel]);

  useEffect(() => {
    decisionFocusHandledRef.current = false;
  }, [focusSection, activePrdId]);

  useEffect(() => {
    if (focusSection !== "decision") return;
    if (sidePanel !== "history") {
      setSidePanel("history");
      return;
    }
    if (decisionFocusHandledRef.current) return;
    if (!decisionNotesAnchorRef.current) return;
    decisionFocusHandledRef.current = true;
    decisionNotesAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSection, sidePanel, historyLoading]);

  const handleRefine = async () => {
    if (!refineText.trim() || !canEdit || !workspaceId) return;
    setLoading(true);
    try {
      const refined = await refinePrd(projectId, activePrdId, workspaceId, refineText);
      setPrd(refined);
      setEditableContent(refined.content || "");
      setContextEntries(refined.context_entries ?? []);
      setVerification(refined.verification ?? null);
      setRefineText("");
      setSuccess("✅ PRD refined successfully");
      setError(null);
      const updatedHistory = await getPrdHistory(projectId, workspaceId);
      setHistory(updatedHistory);
      setActivePrdId(refined.id);
    } catch (err) {
      console.error("Failed to refine PRD:", err);
      setError("⚠️ Failed to refine PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVersion = async () => {
    if (!workspaceId || !editableContent.trim() || !canEdit) return;
    setSavingVersion(true);
    try {
      const saved = await savePrdVersion(projectId, activePrdId, workspaceId, {
        content: editableContent,
        feature_name: prd?.feature_name ?? null,
        description: prd?.description ?? null,
      });
      setPrd(saved);
      setContextEntries(saved.context_entries ?? []);
      setVerification(saved.verification ?? null);
      setActivePrdId(saved.id);
      setSuccess("💾 Saved as new version");
      const updatedHistory = await getPrdHistory(projectId, workspaceId);
      setHistory(updatedHistory);
    } catch (err: any) {
      setError(err.message || "Failed to save version");
      setSuccess(null);
    } finally {
      setSavingVersion(false);
    }
  };

  const handleExport = async () => {
    if (!workspaceId) return;
    try {
      await exportPrd(projectId, activePrdId, workspaceId);
      setSuccess("📤 Export started");
      setError(null);
    } catch (err) {
      console.error("Failed to export PRD:", err);
      setError("⚠️ Failed to export PRD");
      setSuccess(null);
    }
  };

  const handleDelete = async () => {
    if (!workspaceId || !canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    if (!window.confirm("Delete this PRD? This action cannot be undone.")) return;
    setLoading(true);
    try {
      await deletePrd(projectId, activePrdId, workspaceId);
      setSuccess("🗑️ PRD deleted successfully");
      setError(null);
      onBack();
    } catch (err) {
      console.error("Failed to delete PRD:", err);
      setError("⚠️ Failed to delete PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (v1: number, v2: number) => {
    if (!workspaceId) return;
    setDiffLoading(true);
    setDiffSummary(null);
    try {
      const result = await comparePrdVersions(projectId, workspaceId, v1, v2);
      setDiff(result);
    } catch (err: any) {
      setError(err.message || "Failed to build diff");
    } finally {
      setDiffLoading(false);
    }
  };

  const handleSummarizeDiff = async () => {
    if (!workspaceId || !diff) return;
    setSummarizingDiff(true);
    try {
      const summary = await askPrdQuestion(projectId, workspaceId, {
        question: `Summarize the key changes between version ${diff.version_a} and version ${diff.version_b}.`,
        version_a: diff.version_a,
        version_b: diff.version_b,
      });
      setDiffSummary(summary.answer);
    } catch (err: any) {
      setError(err.message || "Failed to summarize differences");
    } finally {
      setSummarizingDiff(false);
    }
  };

  const handleRebuildEmbeddings = async () => {
    if (!workspaceId) return;
    setRebuildingEmbeddings(true);
    try {
      await rebuildPrdEmbeddings(projectId, workspaceId);
      setSuccess("🔁 Rebuilt AI context for this project");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to rebuild embeddings");
    } finally {
      setRebuildingEmbeddings(false);
    }
  };

  const handleSelectVersion = (id: string) => {
    setActivePrdId(id);
    setDiff(null);
    setDiffSummary(null);
  };

  const activeVersion = prd?.version ?? 0;
  const previewContent = useMemo(() => editableContent || "", [editableContent]);

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col gap-4 overflow-hidden">
      <div className={`${SURFACE_CARD} flex flex-wrap items-center justify-between gap-4 px-6 py-5`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={SECONDARY_BUTTON}>
            ⬅ Back
          </button>
          <div>
            <p className={SECTION_LABEL}>Product Requirements</p>
            <h1 className="text-xl font-semibold text-slate-900">{prd?.feature_name || "PRD Detail"}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={PILL_META}>Version {activeVersion || "—"}</span>
          {prd && <span className={PILL_META}>Updated {new Date(prd.updated_at).toLocaleString()}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {loading && <p className="text-slate-500">Loading...</p>}
        {error && <p className="text-rose-600">{error}</p>}
        {success && <p className="text-emerald-600">{success}</p>}
      </div>

      {prd ? (
        <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
          <section className={`${SURFACE_CARD} flex flex-col overflow-hidden`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <p className={SECTION_LABEL}>Current draft</p>
                <p className={BODY_SUBTLE}>
                  {prd.created_by ? "Authored" : "Created"} {new Date(prd.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSaveVersion}
                  disabled={!canEdit || savingVersion || !editableContent.trim()}
                  className={PRIMARY_BUTTON}
                >
                  {savingVersion ? "Saving…" : "Save version"}
                </button>
                <button
                  onClick={handleExport}
                  className={SECONDARY_BUTTON}
                >
                  📤 Export
                </button>
                <button
                  onClick={handleDelete}
                  disabled={!canEdit}
                  className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  🗑 Delete
                </button>
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 px-6 py-4 lg:overflow-hidden">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Markdown source</p>
                <textarea
                  value={editableContent}
                  onChange={(event) => setEditableContent(event.target.value)}
                  disabled={!canEdit}
                  className="mt-2 h-48 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                  placeholder="Edit markdown directly…"
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Preview</p>
                <div className="mt-2 flex-1 overflow-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <SafeMarkdown className="text-base text-slate-900">{previewContent}</SafeMarkdown>
                </div>
              </div>
            </div>
          </section>

          <section className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <div className="rounded-full bg-slate-50 p-1 text-xs font-semibold text-slate-500">
                <button
                  type="button"
                  onClick={() => setSidePanel("assist")}
                  className={`rounded-full px-3 py-1 transition ${
                    sidePanel === "assist" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Assist
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanel("history")}
                  className={`rounded-full px-3 py-1 transition ${
                    sidePanel === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  History
                </button>
              </div>
              <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                {sidePanel === "assist" ? "AI copilots" : "Timeline & decisions"}
              </span>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {sidePanel === "assist" ? (
                <div className="flex h-full flex-col gap-4 overflow-auto pr-1">
                  <VerificationNotice verification={verification} />
                  <ContextUsedPanel entries={contextEntries} />
                  <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900">Refine via AI</p>
                    <textarea
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      placeholder="Describe the change or ask the AI to focus on a section…"
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                      rows={4}
                      disabled={!canEdit}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      {!canEdit && <span>Viewer access cannot refine PRDs.</span>}
                      <button
                        onClick={handleRefine}
                        disabled={loading || !canEdit || !refineText.trim()}
                        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Refine PRD
                      </button>
                    </div>
                  </div>
                  <PRDQAPanel
                    projectId={projectId}
                    prdId={activePrdId}
                    workspaceId={workspaceId}
                    activeVersion={activeVersion}
                    className="shadow-sm"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col gap-4 overflow-auto pr-1">
                  <PRDVersionHistory
                    history={history}
                    loading={historyLoading}
                    selectedPrdId={activePrdId}
                    onSelectVersion={handleSelectVersion}
                    onCompare={handleCompare}
                    onRebuildEmbeddings={handleRebuildEmbeddings}
                    rebuildingEmbeddings={rebuildingEmbeddings}
                    className="shadow-sm"
                  />
                  <PRDDiffView
                    diff={diff}
                    loading={diffLoading}
                    summary={diffSummary}
                    summarizing={summarizingDiff}
                    onSummarize={diff ? handleSummarizeDiff : undefined}
                    onClose={() => {
                      setDiff(null);
                      setDiffSummary(null);
                    }}
                    className="shadow-sm"
                  />
                  <div ref={decisionNotesAnchorRef}>
                    <DecisionNotes
                      projectId={projectId}
                      prdId={activePrdId}
                      workspaceId={workspaceId}
                      currentVersion={activeVersion}
                      projectRole={projectRole}
                      className="shadow-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        !loading && <p className="text-gray-500">No PRD found.</p>
      )}
    </div>
  );
}
