import React, { useMemo, useState } from "react";
import type { ProjectLink } from "../api";

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

type ProjectLinksProps = {
  links: ProjectLink[];
  isLoading: boolean;
  onCreate: (payload: { label: string; url: string; description?: string; tags?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function ProjectLinks({ links, isLoading, onCreate, onDelete }: ProjectLinksProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const linkCountLabel = useMemo(
    () => `${links.length} ${links.length === 1 ? "link" : "links"}`,
    [links.length]
  );

  const resetForm = () => {
    setLabel("");
    setUrl("");
    setDescription("");
    setTagsInput("");
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();

    if (!trimmedLabel) {
      setCreateError("Add a label for the link.");
      return;
    }
    if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
      setCreateError("Use a valid https:// or http:// URL.");
      return;
    }

    setPending(true);
    try {
      await onCreate({
        label: trimmedLabel,
        url: trimmedUrl,
        description: description.trim() || undefined,
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      resetForm();
    } catch (err) {
      console.error("Failed to create link", err);
      setCreateError(err instanceof Error ? err.message : "Unable to create link");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Remove this link from the project?");
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (err) {
      console.error("Failed to delete link", err);
      setDeleteError(err instanceof Error ? err.message : "Unable to delete link");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Project Links</h2>
          {links.length > 0 && (
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {linkCountLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Collect design files, research docs, and other artifacts your team references often.
        </p>

        <form onSubmit={handleCreate} className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Figma wireframes"
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://"
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="design, research, flows"
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
          {createError && <p className="text-sm text-rose-500">{createError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add link"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800">Saved links</h3>
        {isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Loading links…</p>
        ) : links.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No links yet. Add one above to keep your references handy.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                  >
                    {link.label}
                  </a>
                  {link.description && (
                    <p className="mt-1 text-sm text-slate-600">{link.description}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">Saved {new Date(link.created_at).toLocaleString()}</p>
                  {link.tags && link.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-blue-600">
                      {link.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-blue-50 px-2 py-1">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(link.id)}
                  disabled={deletingId === link.id}
                  className="text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:text-rose-700 disabled:opacity-60"
                >
                  {deletingId === link.id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleteError && <p className="mt-3 text-sm text-rose-500">{deleteError}</p>}
      </div>
    </section>
  );
}
