import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { generatePhaseFeedback, type RoadmapRetrospective } from "../../api";
import { SECTION_LABEL, SECONDARY_BUTTON } from "../../styles/theme";

type PhaseFeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  phaseId: string;
  workspaceId: string | null;
};

export default function PhaseFeedbackModal({ open, onClose, projectId, phaseId, workspaceId }: PhaseFeedbackModalProps) {
  const [feedback, setFeedback] = useState<RoadmapRetrospective | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workspaceId) return;
    setLoading(true);
    setError(null);
    generatePhaseFeedback(projectId, phaseId, workspaceId)
      .then((data) => setFeedback(data))
      .catch((err) => setError(err.message || "Failed to generate feedback"))
      .finally(() => setLoading(false));
  }, [open, workspaceId, projectId, phaseId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={SECTION_LABEL}>AI retrospective</p>
                <h3 className="text-lg font-semibold text-slate-900">Phase feedback</h3>
              </div>
              <button onClick={onClose} className={SECONDARY_BUTTON}>
                Close
              </button>
            </div>
            {loading && <p className="mt-4 text-sm text-slate-500">Gathering insights…</p>}
            {error && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}
            {feedback && (
              <div className="mt-4 space-y-4 text-sm text-slate-700">
                <section>
                  <p className={SECTION_LABEL}>Summary</p>
                  <p className="mt-2 text-base text-slate-900">{feedback.summary}</p>
                </section>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">Went well</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {feedback.went_well.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">Needs improvement</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {feedback.needs_improvement.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Lessons</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {feedback.lessons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
