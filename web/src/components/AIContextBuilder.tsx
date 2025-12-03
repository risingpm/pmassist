import { useEffect, useMemo, useState } from "react";
import {
  createWorkspaceMemory,
  listWorkspaceMemory,
  updateWorkspaceMemory,
  type WorkspaceMemory,
} from "../api";
import { SURFACE_CARD, SURFACE_MUTED, SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, BODY_SUBTLE } from "../styles/theme";

type AIContextBuilderProps = {
  workspaceId: string | null;
};

export default function AIContextBuilder({ workspaceId }: AIContextBuilderProps) {
  const [memories, setMemories] = useState<WorkspaceMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const pinned = useMemo(() => memories.filter((item) => item.pinned), [memories]);
  const recent = useMemo(() => memories.filter((item) => !item.pinned), [memories]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    const timeout = setTimeout(() => {
      listWorkspaceMemory(workspaceId, {
        query: query.trim() || undefined,
        limit: 40,
      })
        .then((items) => {
          if (!cancelled) {
            setMemories(items);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err.message || "Failed to load workspace memory.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [workspaceId, query, refreshKey]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !newContent.trim()) {
      setError("Context can’t be empty.");
      return;
    }
    setSaving(true);
    try {
      await createWorkspaceMemory(workspaceId, {
        content: newContent.trim(),
        source: "manual",
        tags: newTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setNewContent("");
      setNewTags("");
      setError(null);
      setRefreshKey((prev) => prev + 1);
    } catch (err: any) {
      setError(err.message || "Failed to store context.");
    } finally {
      setSaving(false);
    }
  };

  const togglePinned = async (memory: WorkspaceMemory, pinnedState: boolean) => {
    if (!workspaceId) return;
    try {
      const updated = await updateWorkspaceMemory(workspaceId, memory.id, { pinned: pinnedState });
      setMemories((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: any) {
      setError(err.message || "Failed to update memory.");
    }
  };

  return (
    <section className="space-y-4">
      <div className={`${SURFACE_CARD} p-6`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>AI Context Builder</p>
            <p className={BODY_SUBTLE}>
              Curate workspace highlights the assistant should remember for future chats, docs, and roadmaps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memory…"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={() => setRefreshKey((prev) => prev + 1)}
              className={SECONDARY_BUTTON}
            >
              Refresh
            </button>
          </div>
        </header>
        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <textarea
            value={newContent}
            onChange={(event) => setNewContent(event.target.value)}
            placeholder="Summarize the insight, decision, or win you want the AI to remember…"
            rows={3}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            value={newTags}
            onChange={(event) => setNewTags(event.target.value)}
            placeholder="Tags (comma separated)"
            className="w-full rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            {error && <span className="text-rose-500">{error}</span>}
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Saving…" : "Remember this"}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className={`${SURFACE_MUTED} animate-pulse p-4 text-sm text-slate-500`}>Gathering workspace memory…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${SURFACE_CARD} p-5`}>
            <p className={SECTION_LABEL}>Pinned context</p>
            {pinned.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Pin memory to keep it in every AI prompt.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pinned.map((memory) => (
                  <li key={memory.id} className={`${SURFACE_MUTED} p-3`}>
                    <p className="text-sm font-semibold text-slate-900">{memory.source}</p>
                    <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{memory.content}</p>
                    {memory.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-blue-600">
                        {memory.tags.map((tag) => (
                          <span key={`${memory.id}-${tag}`} className="rounded-full bg-blue-50 px-2 py-0.5">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePinned(memory, false)}
                      className="mt-3 text-xs font-semibold text-rose-500 hover:text-rose-600"
                    >
                      Remove from context
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`${SURFACE_CARD} p-5`}>
            <p className={SECTION_LABEL}>Recent memory</p>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">New AI interactions will show up here automatically.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {recent.map((memory) => (
                  <li key={memory.id} className={`${SURFACE_MUTED} p-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{memory.source}</p>
                        <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{memory.content}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePinned(memory, true)}
                        className="text-xs font-semibold uppercase tracking-wide text-blue-600 hover:text-blue-700"
                      >
                        Pin
                      </button>
                    </div>
                    {memory.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-blue-600">
                        {memory.tags.map((tag) => (
                          <span key={`${memory.id}-${tag}`} className="rounded-full bg-blue-50 px-2 py-0.5">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
