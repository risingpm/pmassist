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

const TABS: Array<{ id: string; label: string; type?: KnowledgeBaseEntryType }> = [
  { id: "documents", label: "Documents", type: "document" },
  { id: "insights", label: "Insights", type: "insight" },
  { id: "research", label: "Research", type: "research" },
  { id: "ai", label: "AI Outputs", type: "ai_output" },
];

interface KnowledgeBasePanelProps {
  workspaceId: string | null;
  workspaceRole: WorkspaceRole;
  userId: string | null;
  projectOptions?: Array<{ id: string; label: string }>;
}

export default function KnowledgeBasePanel({
  workspaceId,
  workspaceRole,
  userId,
  projectOptions,
}: KnowledgeBasePanelProps) {
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [usingSemanticSearch, setUsingSemanticSearch] = useState(false);
  const canEdit = workspaceRole === "admin" || workspaceRole === "editor";

  const selectedType = useMemo(() => TABS.find((tab) => tab.id === activeTab)?.type, [activeTab]);

  const loadEntries = useCallback(async () => {
    if (!workspaceId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trimmedSearch = search.trim();
      const useSemantic = trimmedSearch.length >= 3;
      if (useSemantic) {
        const results = await searchKnowledgeBase(workspaceId, trimmedSearch, selectedType, userId ?? undefined);
        const normalized: KnowledgeBaseEntry[] = results.map((result: KnowledgeSearchResult) => ({
          id: result.id,
          kb_id: workspaceId,
          type: result.type,
          title: result.title || result.filename || "Untitled entry",
          content: result.content || "",
          file_url: null,
          source_url: null,
          created_by: null,
          project_id: result.project_id ?? null,
          tags: [],
          created_at: result.uploaded_at,
          updated_at: result.uploaded_at,
        }));
        setEntries(normalized);
      } else {
        const list = await listKnowledgeBaseEntries(
          workspaceId,
          { type: selectedType, search: trimmedSearch || undefined },
          userId ?? undefined
        );
        setEntries(list);
      }
      setUsingSemanticSearch(useSemantic);
    } catch (err: any) {
      setError(err.message || "Failed to load knowledge base entries.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedType, search, userId]);

  useEffect(() => {
    if (!workspaceId) {
      setEntries([]);
      return;
    }
    loadEntries();
  }, [workspaceId, selectedType, search, loadEntries]);

  const handleCreateText = async (payload: KnowledgeBaseEntryPayload) => {
    if (!workspaceId) return;
    await createKnowledgeBaseEntry(workspaceId, payload, userId ?? undefined);
    await loadEntries();
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
  };

  const handleDelete = async (entryId: string) => {
    if (!canEdit) return;
    const confirmed = window.confirm("Delete this knowledge base entry?");
    if (!confirmed) return;
    if (!workspaceId) return;
    await deleteKnowledgeBaseEntry(workspaceId, entryId, userId ?? undefined);
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  const filteredEntries = useMemo(() => entries, [entries]);

  if (!workspaceId) {
    return (
      <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Knowledge Base</h2>
        <p className="mt-2 text-sm text-slate-500">Select a workspace to load its knowledge base.</p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold">Knowledge Base</h2>
            <p className="mt-1 text-sm text-slate-500">
              Workspace-wide documents, research, and AI outputs for context.
            </p>
            {!canEdit && (
              <p className="mt-2 text-xs text-amber-600">Viewer access cannot add or edit entries.</p>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => setShowModal(true)}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Add entry
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm font-semibold">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1 transition ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search entries..."
              className="rounded-full border border-slate-200 px-4 py-1 text-sm"
            />
          </div>
        </div>
        {usingSemanticSearch && search.trim().length >= 3 && (
          <p className="mt-2 text-xs text-slate-500">
            Showing top matches for “{search.trim()}” via semantic search.
          </p>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Loading entries...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
        ) : filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No entries yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-3 pr-3">Title</th>
                  <th className="pb-3 pr-3">Type</th>
                  <th className="pb-3 pr-3">Tags</th>
                  <th className="pb-3 pr-3">Updated</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100 text-slate-600">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-slate-900">{entry.title}</p>
                      {entry.content && (
                        <p className="text-xs text-slate-500">{entry.content.slice(0, 120)}{entry.content.length > 120 ? "..." : ""}</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {entry.type}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {entry.tags.length > 0 ? entry.tags.join(", ") : "—"}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {new Date(entry.updated_at).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {entry.file_url && (
                          <a
                            href={knowledgeEntryDownloadUrl(workspaceId, entry.id, userId ?? undefined)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                          >
                            Download
                          </a>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
