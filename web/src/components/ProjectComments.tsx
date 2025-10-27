import React, { useMemo, useState } from "react";
import type { ProjectComment } from "../api";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

type ProjectCommentsProps = {
  comments: ProjectComment[];
  isLoading: boolean;
  onCreate: (content: string, tags: string[]) => Promise<void>;
  onUpdate: (id: string, content: string, tags: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function ProjectComments({ comments, isLoading, onCreate, onUpdate, onDelete }: ProjectCommentsProps) {
  const [draft, setDraft] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const [editingPending, setEditingPending] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);

  const hasComments = comments.length > 0;
  const commentCountLabel = useMemo(
    () => `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`,
    [comments.length]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) {
      setCreateError("Share a quick note before submitting.");
      return;
    }

    setCreateError(null);
    setCreatePending(true);
    try {
      await onCreate(content, parseTags(tagsInput));
      setDraft("");
      setTagsInput("");
    } catch (err) {
      console.error("Failed to create comment", err);
      setCreateError("Unable to save comment. Try again.");
    } finally {
      setCreatePending(false);
    }
  };

  const handleStartEdit = (comment: ProjectComment) => {
    setEditingId(comment.id);
    setEditingDraft(comment.content);
    setEditingTags((comment.tags ?? []).join(", "));
    setEditingError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingDraft("");
    setEditingTags("");
    setEditingPending(false);
    setEditingError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    const content = editingDraft.trim();
    if (!content) {
      setEditingError("Comment cannot be empty.");
      return;
    }

    setEditingPending(true);
    setEditingError(null);
    try {
      await onUpdate(editingId, content, parseTags(editingTags));
      handleCancelEdit();
    } catch (err) {
      console.error("Failed to update comment", err);
      setEditingError("Unable to update comment. Try again.");
      setEditingPending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmation = window.confirm("Delete this comment?");
    if (!confirmation) return;
    try {
      await onDelete(id);
    } catch (err) {
      console.error("Failed to delete comment", err);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Project Comments</h2>
          {hasComments && (
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {commentCountLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Capture ongoing discussions, insights, and next steps that shape this project.
        </p>

        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Share an observation, stakeholder feedback, or next action..."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Tags (comma separated, e.g. risk, opportunity)"
            />
            <button
              type="submit"
              disabled={createPending}
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {createPending ? "Saving..." : "Add comment"}
            </button>
          </div>
          {createError && <p className="text-sm text-rose-500">{createError}</p>}
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">History</h3>
        {isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Loading comments…</p>
        ) : !hasComments ? (
          <p className="mt-3 text-sm text-slate-500">
            No comments yet. Start the conversation above to capture what matters.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {comments.map((comment) => {
              const isEditing = editingId === comment.id;
              const tags = comment.tags ?? [];
              return (
                <li
                  key={comment.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdate} className="space-y-3">
                      <textarea
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                        rows={4}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      <input
                        type="text"
                        value={editingTags}
                        onChange={(event) => setEditingTags(event.target.value)}
                        className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder="Tags (comma separated)"
                      />
                      {editingError && <p className="text-sm text-rose-500">{editingError}</p>}
                      <div className="flex items-center gap-3 text-sm">
                        <button
                          type="submit"
                          disabled={editingPending}
                          className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                        >
                          {editingPending ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="rounded-full bg-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-500">
                          {formatDate(comment.created_at)}
                          {comment.updated_at !== comment.created_at && " · Edited"}
                        </p>
                        <div className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          <button
                            onClick={() => handleStartEdit(comment)}
                            className="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="rounded-full bg-white px-3 py-1 text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-base text-slate-800">{comment.content}</p>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
