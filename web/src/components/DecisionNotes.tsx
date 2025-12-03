import { useEffect, useState } from "react";
import {
  createDecisionNote,
  listDecisionNotes,
  type PRDDecisionNote,
  type ProjectRole,
} from "../api";

type DecisionNotesProps = {
  projectId: string;
  prdId: string;
  workspaceId: string | null;
  currentVersion: number;
  projectRole: ProjectRole;
  className?: string;
};

export default function DecisionNotes({
  projectId,
  prdId,
  workspaceId,
  currentVersion,
  projectRole,
  className,
}: DecisionNotesProps) {
  const [notes, setNotes] = useState<PRDDecisionNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const canEdit = projectRole === "owner" || projectRole === "contributor";

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    listDecisionNotes(projectId, prdId, workspaceId)
      .then(setNotes)
      .catch((err) => setError(err.message || "Failed to load decision notes"))
      .finally(() => setLoading(false));
  }, [projectId, prdId, workspaceId]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !decision.trim()) return;
    setSaving(true);
    try {
      const note = await createDecisionNote(projectId, prdId, workspaceId, {
        decision: decision.trim(),
        rationale: rationale.trim() || null,
        version: currentVersion,
      });
      setNotes((prev) => [note, ...prev]);
      setDecision("");
      setRationale("");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to save decision");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Decision log</p>
          <h3 className="text-lg font-semibold text-slate-900">Version rationale</h3>
          <p className="text-sm text-slate-500">Capture why major edits happened. Each note is tied to version {currentVersion}.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-4 space-y-2">
        <input
          type="text"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          placeholder="Decision"
          disabled={!canEdit || saving}
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
        />
        <textarea
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="Rationale"
          rows={3}
          disabled={!canEdit || saving}
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          {!canEdit && <span>Viewer access cannot log decisions.</span>}
          <button
            type="submit"
            disabled={!canEdit || saving || !decision.trim() || !workspaceId}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Log decision"}
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-6 max-h-60 space-y-3 overflow-y-auto pr-1">
        {loading && <p className="text-sm text-slate-500">Loading notes…</p>}
        {!loading && notes.length === 0 && (
          <p className="text-sm text-slate-500">No notes yet. Use the form above to capture decisions.</p>
        )}
        {notes.map((note) => (
          <div key={note.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Version {note.version}</span>
              <span>{new Date(note.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">{note.decision}</p>
            {note.rationale && <p className="mt-1 text-sm text-slate-600">{note.rationale}</p>}
            {note.author_name && (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                Logged by {note.author_name}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
