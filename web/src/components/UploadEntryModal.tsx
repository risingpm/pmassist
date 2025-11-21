import { useEffect, useMemo, useState } from "react";
import type { KnowledgeBaseEntryPayload, KnowledgeBaseEntryType } from "../api";

const FILE_TYPES: KnowledgeBaseEntryType[] = ["document", "repo", "research"];
const NOTE_TYPES: KnowledgeBaseEntryType[] = ["insight", "research", "prd", "ai_output"];

type UploadMode = "file" | "note";

type UploadEntryModalProps = {
  open: boolean;
  onClose: () => void;
  onCreateText: (payload: KnowledgeBaseEntryPayload) => Promise<void>;
  onUploadFile: (
    file: File,
    payload: { type: KnowledgeBaseEntryType; title?: string; tags?: string[]; project_id?: string | null }
  ) => Promise<void>;
  projectOptions?: Array<{ id: string; label: string }>;
  defaultProjectId?: string | null;
  projectIdLocked?: boolean;
};

export default function UploadEntryModal({
  open,
  onClose,
  onCreateText,
  onUploadFile,
  projectOptions,
  defaultProjectId,
  projectIdLocked = false,
}: UploadEntryModalProps) {
  const [mode, setMode] = useState<UploadMode>("file");
  const [entryType, setEntryType] = useState<KnowledgeBaseEntryType>("document");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showProjectSelector = useMemo(
    () => !!(projectOptions?.length || defaultProjectId),
    [projectOptions?.length, defaultProjectId]
  );

  if (!open) return null;

  const allowedTypes = mode === "file" ? FILE_TYPES : NOTE_TYPES;

  const reset = () => {
    setTitle("");
    setContent("");
    setFile(null);
    setTags("");
    setEntryType(mode === "file" ? FILE_TYPES[0] : NOTE_TYPES[0]);
    setProjectId(defaultProjectId ?? "");
    setError(null);
    setSubmitting(false);
  };

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId ?? "");
  }, [open, defaultProjectId]);

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const parsedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const payloadProjectId = projectId || undefined;
      if (mode === "file") {
        if (!file) throw new Error("Select a file to upload");
        await onUploadFile(file, {
          type: entryType,
          title: title || undefined,
          tags: parsedTags,
          project_id: payloadProjectId,
        });
      } else {
        if (!content.trim()) throw new Error("Content is required for notes");
        const payload: KnowledgeBaseEntryPayload = {
          type: entryType,
          title: title || "Untitled entry",
          content,
          tags: parsedTags,
        };
        if (payloadProjectId) {
          payload.project_id = payloadProjectId;
        }
        await onCreateText(payload);
      }
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Knowledge base</p>
            <h3 className="text-lg font-semibold text-slate-900">Add entry</h3>
          </div>
          <button onClick={handleClose} className="text-slate-400 transition hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (mode === "file") return;
              setMode("file");
              setEntryType(FILE_TYPES[0]);
            }}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "file" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Upload file
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === "note") return;
              setMode("note");
              setEntryType(NOTE_TYPES[0]);
            }}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === "note" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Add note
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
            <select
              value={entryType}
              onChange={(event) => setEntryType(event.target.value as KnowledgeBaseEntryType)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {allowedTypes.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {typeOption.charAt(0).toUpperCase() + typeOption.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Title
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Give this entry a title"
            />
          </div>

          {mode === "file" ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                File
              </label>
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-1 w-full text-sm"
                accept=".pdf,.doc,.docx,.txt,.md"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Content
              </label>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={5}
                placeholder="Add research notes, insights, or AI outputs"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tags
            </label>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Comma separated"
            />
          </div>

          {showProjectSelector && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Attach to project
              </label>
              {projectIdLocked || !projectOptions?.length ? (
                <input
                  value={
                    projectOptions?.find((option) => option.id === (projectId || defaultProjectId))?.label ||
                    (projectId || defaultProjectId ? "This project" : "Workspace-wide")
                  }
                  readOnly
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-600"
                />
              ) : (
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Workspace-wide</option>
                  {projectOptions?.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Project-tagged entries show inside that project's Knowledge tab.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
