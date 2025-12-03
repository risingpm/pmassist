import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { API_BASE, type Prototype } from "../api";
import { SURFACE_CARD, SURFACE_MUTED, SECTION_LABEL, PRIMARY_BUTTON, PILL_META, BODY_SUBTLE } from "../styles/theme";

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const PrototypeSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className={`${SURFACE_MUTED} animate-pulse p-4`}>
        <div className="h-4 w-1/3 rounded-full bg-slate-200" />
        <div className="mt-2 h-3 w-full rounded-full bg-slate-100" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
      </div>
    ))}
  </div>
);

type ProjectPrototypesProps = {
  prototypes: Prototype[];
  loading: boolean;
  onGenerate: (payload: { phase: string; focus: string; count: number }) => Promise<void>;
  generating: boolean;
  onDelete: (id: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  deletingAll: boolean;
};

export default function ProjectPrototypes({
  prototypes,
  loading,
  onGenerate,
  generating,
  onDelete,
  onDeleteAll,
  deletingAll,
}: ProjectPrototypesProps) {
  const [phase, setPhase] = useState("");
  const [focus, setFocus] = useState("");
  const [variants, setVariants] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const parsedVariants = useMemo(() => {
    const parsed = Number.parseInt(variants, 10);
    if (Number.isNaN(parsed) || parsed < 1) return 1;
    if (parsed > 5) return 5;
    return parsed;
  }, [variants]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      await onGenerate({ phase: phase.trim(), focus: focus.trim(), count: parsedVariants });
      setPhase("");
      setFocus("");
      setVariants("1");
    } catch (err) {
      console.error("Failed to generate prototype", err);
      setError(err instanceof Error ? err.message : "Unable to generate prototype");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this prototype? This action cannot be undone.");
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (err) {
      console.error("Failed to delete prototype", err);
      setDeleteError(err instanceof Error ? err.message : "Unable to delete prototype");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      "Delete all prototypes and related chats? This action cannot be undone."
    );
    if (!confirmed) return;

    setDeleteError(null);
    try {
      await onDeleteAll();
    } catch (err) {
      console.error("Failed to delete prototypes", err);
      setDeleteError(err instanceof Error ? err.message : "Unable to delete prototypes");
    }
  };

  return (
    <section className="space-y-6">
      <div className={`${SURFACE_CARD} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={SECTION_LABEL}>Prototype Generator</p>
            <h2 className="text-xl font-semibold text-slate-900">AI Prototype Studio</h2>
            <p className={BODY_SUBTLE}>Spin up lightweight screen blueprints anchored to your roadmap. Describe the phase or focus below.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Roadmap phase (optional)
              </label>
              <input
                type="text"
                value={phase}
                onChange={(event) => setPhase(event.target.value)}
                placeholder="e.g. MVP Launch"
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Focus or prompt
              </label>
              <input
                type="text"
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="e.g. onboarding flow with social proof"
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Variants
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={variants}
                onChange={(event) => setVariants(event.target.value)}
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <p className="text-xs text-slate-400">Generate up to 5 variants in one go.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={generating} className={PRIMARY_BUTTON}>
              {generating ? "Generating…" : parsedVariants > 1 ? `Generate ${parsedVariants} prototypes` : "Generate prototype"}
            </button>
            {error && <p className="text-sm text-rose-500">{error}</p>}
          </div>
        </form>
      </div>

      <div className={`${SURFACE_CARD} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Generated prototypes</h3>
          <div className="flex flex-wrap items-center gap-3">
            {prototypes.length > 0 && (
              <span className={PILL_META}>
                {prototypes.length} {prototypes.length === 1 ? "prototype" : "prototypes"}
              </span>
            )}
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll || prototypes.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:bg-rose-200 disabled:opacity-60"
            >
              {deletingAll ? "Removing…" : "Delete all"}
            </button>
          </div>
        </div>

        {loading ? (
          <PrototypeSkeleton />
        ) : prototypes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No prototypes yet. Generate one above to turn your roadmap into an interactive story.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            <ul className="mt-4 space-y-4">
              {prototypes.map((prototype) => (
                <motion.li
                  key={prototype.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className={`${SURFACE_MUTED} p-4`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-800">{prototype.title}</h4>
                      <p className="text-sm text-slate-500">{prototype.summary}</p>
                      {Array.isArray(prototype.spec.success_metrics) && prototype.spec.success_metrics.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-700">
                          {prototype.spec.success_metrics.map((metric) => (
                            <li key={metric} className="rounded-full bg-emerald-50 px-2 py-1">
                              {metric}
                            </li>
                          ))}
                        </ul>
                      )}
                      {Array.isArray(prototype.spec.metadata?.assistant_metrics as string[] | undefined) && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics captured</p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-600">
                            {(prototype.spec.metadata?.assistant_metrics as string[]).map((item) => (
                              <li key={item} className="flex items-start gap-2">
                                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(prototype.created_at)}
                      {prototype.phase ? ` · ${prototype.phase}` : ""}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {prototype.bundle_url && (
                      <a
                        href={
                          prototype.bundle_url.startsWith("http")
                            ? prototype.bundle_url
                            : `${API_BASE.replace(/\/$/, "")}/${prototype.bundle_url.replace(/^\/+/, "")}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-blue-700"
                      >
                        Launch prototype
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(prototype.id)}
                      disabled={deletingId === prototype.id}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:bg-rose-200 disabled:opacity-60"
                    >
                      {deletingId === prototype.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Screens</p>
                      <ul className="mt-2 space-y-2">
                        {prototype.spec.key_screens.map((screen) => (
                          <li key={screen.name} className="rounded-xl bg-white p-3 shadow-sm">
                            <p className="text-sm font-medium text-slate-800">{screen.name}</p>
                            <p className="text-xs text-slate-500">{screen.goal}</p>
                            <ul className="mt-1 flex flex-wrap gap-1 text-xs text-blue-600">
                              {screen.primary_actions.map((action) => (
                                <li key={action} className="rounded-full bg-blue-50 px-2 py-1">{action}</li>
                              ))}
                            </ul>
                            {screen.layout_notes && (
                              <p className="mt-1 text-xs italic text-slate-500">{screen.layout_notes}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-3">
                      {prototype.spec.user_flow && prototype.spec.user_flow.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">User flow</p>
                          <ol className="mt-2 space-y-1 text-sm text-slate-600">
                            {prototype.spec.user_flow.map((step, index) => (
                              <li key={`${prototype.id}-flow-${index}`}>
                                <span className="font-semibold text-blue-600">{index + 1}.</span> {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {prototype.html_preview && (
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                          <div
                            className="prototype-preview mt-2 text-sm text-slate-700"
                            dangerouslySetInnerHTML={{ __html: prototype.html_preview }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </AnimatePresence>
        )}
        {deleteError && <p className="mt-3 text-sm text-rose-500">{deleteError}</p>}
      </div>
    </section>
  );
}
