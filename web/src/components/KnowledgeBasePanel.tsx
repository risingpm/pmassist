import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  KnowledgeBaseEntry,
  KnowledgeBaseEntryType,
  KnowledgeBaseEntryPayload,
  KnowledgeSearchResult,
  WorkspaceRole,
} from "../api";
import {
  listKnowledgeBaseEntries,
  createKnowledgeBaseEntry,
  uploadKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  knowledgeEntryDownloadUrl,
  searchKnowledgeBase,
} from "../api";
import UploadEntryModal from "./UploadEntryModal";
import useWorkspaceInsights from "../hooks/useWorkspaceInsights";
import useAgentName from "../hooks/useAgentName";
import { SURFACE_CARD, SURFACE_MUTED, SECTION_LABEL, PRIMARY_BUTTON, PILL_META, BODY_SUBTLE } from "../styles/theme";

const TABS: Array<{ id: string; label: string; type?: KnowledgeBaseEntryType }> = [
  { id: "documents", label: "Documents", type: "document" },
  { id: "insights", label: "Insights", type: "insight" },
  { id: "research", label: "Research", type: "research" },
  { id: "repositories", label: "Repositories", type: "repo" },
];

const TYPE_LABELS: Record<KnowledgeBaseEntryType, string> = {
  document: "Document",
  insight: "Insight",
  research: "Research",
  repo: "Repository",
  prd: "PRD",
  ai_output: "AI Output",
  roadmap: "Roadmap",
  prototype: "Prototype",
};

interface KnowledgeBasePanelProps {
  workspaceId: string | null;
  workspaceRole: WorkspaceRole;
  userId: string | null;
  projectOptions?: Array<{ id: string; label: string }>;
}

type ToastState = { type: "success" | "error"; message: string } | null;

const SkeletonList = ({ count = 6 }: { count?: number }) => (
  <div className="mt-6 space-y-3">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className={`${SURFACE_MUTED} animate-pulse p-4`}>
        <div className="h-4 w-1/3 rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-full rounded-full bg-slate-100" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
      </div>
    ))}
  </div>
);

export default function KnowledgeBasePanel({
  workspaceId,
  workspaceRole,
  userId,
  projectOptions,
}: KnowledgeBasePanelProps) {
  const agentName = useAgentName();
  const { insight: coachInsight } = useWorkspaceInsights(workspaceId, userId);
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [usingSemanticSearch, setUsingSemanticSearch] = useState(false);
  const [feedback, setFeedback] = useState<ToastState>(null);
  const canEdit = workspaceRole === "admin" || workspaceRole === "editor";

  const selectedType = useMemo(
    () => TABS.find((tab) => tab.id === activeTab)?.type,
    [activeTab]
  );

  const availableTags = useMemo(() => {
    const collected = new Set<string>();
    entries.forEach((entry) => {
      entry.tags?.forEach((tag) => collected.add(tag));
    });
    return Array.from(collected).sort();
  }, [entries]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const loadEntries = useCallback(async () => {
    if (!workspaceId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trimmedSearch = search.trim();
      const canUseSemantic = trimmedSearch.length >= 3 && !tagFilter;
      if (canUseSemantic) {
        const results = await searchKnowledgeBase(
          workspaceId,
          trimmedSearch,
          selectedType,
          userId ?? undefined
        );
        const normalized: KnowledgeBaseEntry[] = results.map((result: KnowledgeSearchResult) => ({
          id: result.id,
          kb_id: workspaceId,
          type: result.type,
          title: result.title || "Untitled entry",
          content: result.content || "",
          file_url: null,
          source_url: null,
          created_by: null,
          created_by_email: null,
          project_id: result.project_id ?? null,
          tags: result.tags ?? [],
          created_at: result.uploaded_at,
          updated_at: result.uploaded_at,
        }));
        setEntries(normalized);
        setUsingSemanticSearch(true);
      } else {
        const list = await listKnowledgeBaseEntries(
          workspaceId,
          {
            type: selectedType,
            search: trimmedSearch || undefined,
            tag: tagFilter || undefined,
          },
          userId ?? undefined
        );
        setEntries(list);
        setUsingSemanticSearch(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load knowledge base entries.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedType, search, tagFilter, userId]);

  useEffect(() => {
    if (!workspaceId) {
      setEntries([]);
      return;
    }
    loadEntries();
  }, [workspaceId, selectedType, search, tagFilter, loadEntries]);

  const handleCreateText = async (payload: KnowledgeBaseEntryPayload) => {
    if (!workspaceId) return;
    await createKnowledgeBaseEntry(workspaceId, payload, userId ?? undefined);
    await loadEntries();
    setFeedback({ type: "success", message: "Entry added to the workspace knowledge base." });
  };

  const handleUploadFile = async (
    file: File,
    payload: { type: KnowledgeBaseEntryType; title?: string; tags?: string[]; project_id?: string | null }
  ) => {
    if (!workspaceId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entry_type", payload.type);
    if (payload.title) formData.append("title", payload.title);
    if (payload.tags?.length) formData.append("tags", payload.tags.join(","));
    if (payload.project_id) formData.append("project_id", payload.project_id);
    await uploadKnowledgeBaseEntry(workspaceId, formData, userId ?? undefined);
    await loadEntries();
    setFeedback({ type: "success", message: "File uploaded to the knowledge base." });
  };

  const handleDelete = async (entryId: string) => {
    if (!canEdit || !workspaceId) return;
    const confirmed = window.confirm("Delete this knowledge base entry?");
    if (!confirmed) return;
    await deleteKnowledgeBaseEntry(workspaceId, entryId, userId ?? undefined);
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    setFeedback({ type: "success", message: "Entry deleted." });
  };

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return value;
    }
  };

  if (!workspaceId) {
    return (
      <section className={`${SURFACE_CARD} mt-8 p-6`}>
        <h2 className="text-2xl font-semibold text-slate-900">Knowledge Base</h2>
        <p className={BODY_SUBTLE}>Select a workspace to load its knowledge base.</p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-6">
      {coachInsight && (
        <div className="rounded-3xl border border-slate-900/10 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">AI Coach · {agentName}</p>
          <h3 className="mt-2 text-xl font-semibold">{coachInsight.summary}</h3>
          {coachInsight.verification && (
            <p
              className={`mt-2 text-xs ${
                coachInsight.verification.status === "passed"
                  ? "text-emerald-200"
                  : coachInsight.verification.status === "failed"
                    ? "text-rose-200"
                    : "text-amber-200"
              }`}
            >
              {coachInsight.verification.message}
            </p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {coachInsight.recommendations.slice(0, 2).map((rec) => (
              <div key={rec.title} className="rounded-2xl bg-white/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-blue-200">{rec.severity || "Insight"}</p>
                <p className="text-sm font-semibold text-white/90">{rec.title}</p>
                <p className="text-xs text-white/70">{rec.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-300">
            {coachInsight.context_entries.length > 0
              ? `${agentName} referenced ${coachInsight.context_entries.length} knowledge base entries.`
              : `${agentName} analyzed the latest metrics for this workspace.`}
          </p>
        </div>
      )}
      <div className={`${SURFACE_CARD} p-6`}>
        <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={SECTION_LABEL}>Workspace knowledge</p>
            <h2 className="text-3xl font-semibold text-slate-900">Knowledge Base</h2>
            <p className={BODY_SUBTLE}>Upload documents, insights, and research the AI can reason over.</p>
            {!canEdit && <p className="mt-2 text-xs text-amber-600">Viewer access cannot upload or delete entries.</p>}
          </div>
          {canEdit && (
            <button onClick={() => setShowModal(true)} className={PRIMARY_BUTTON}>
              Upload entry
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`mb-4 rounded-2xl px-4 py-2 text-sm ${
              feedback.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setTagFilter("");
                }}
                className={`rounded-full px-4 py-1 transition ${
                  activeTab === tab.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles or tags…"
              type="search"
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {availableTags.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span>Tags:</span>
            <button
              onClick={() => setTagFilter("")}
              className={`rounded-full px-3 py-1 ${
                tagFilter === "" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className={`rounded-full px-3 py-1 capitalize ${
                  tagFilter === tag
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {usingSemanticSearch && search.trim().length >= 3 && (
          <p className="mt-2 text-xs text-slate-500">
            Showing the most relevant entries for “{search.trim()}” via semantic search.
          </p>
        )}

        {loading ? (
          <SkeletonList count={6} />
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className={`${SURFACE_MUTED} mt-6 border-dashed p-8 text-center text-sm text-slate-500`}>
            No entries match your filters. {canEdit ? "Upload a document to get started." : "Ask an editor to add context."}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {entries.map((entry) => (
              <article key={entry.id} className={`${SURFACE_CARD} p-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className={PILL_META}>{TYPE_LABELS[entry.type] ?? entry.type}</span>
                      <span className={BODY_SUBTLE}>{formatDate(entry.created_at)}</span>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">{entry.title}</h3>
                    {entry.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <button
                            key={`${entry.id}-${tag}`}
                            onClick={() => setTagFilter(tag)}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {entry.content && (
                      <p className="mt-3 text-sm text-slate-600">
                        {entry.content.length > 280 ? `${entry.content.slice(0, 280)}…` : entry.content}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    <p className="font-semibold text-slate-600">Uploaded by</p>
                    <p className="text-slate-900">{entry.created_by_email || "Workspace collaborator"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-600">
                  {entry.file_url && (
                    <a
                      href={knowledgeEntryDownloadUrl(workspaceId, entry.id, userId ?? undefined)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Download
                    </a>
                  )}
                  {canEdit ? (
                    <button onClick={() => handleDelete(entry.id)} className="text-rose-600 hover:text-rose-700">
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs uppercase tracking-wide text-slate-400">Read-only</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showModal && workspaceId && (
        <UploadEntryModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onCreateText={handleCreateText}
          onUploadFile={handleUploadFile}
          projectOptions={projectOptions}
        />
      )}
    </section>
  );
}
