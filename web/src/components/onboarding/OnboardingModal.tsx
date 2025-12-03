import { AnimatePresence, motion } from "framer-motion";

type OnboardingModalProps = {
  open: boolean;
  onStart: () => void;
  onSkip: () => void;
};

const CHECKLIST = [
  "Explore the Demo Project",
  "Ask your AI Coach",
  "Create your first project",
];

export default function OnboardingModal({ open, onStart, onSkip }: OnboardingModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md scale-100 rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-slate-900/10"
            role="dialog"
            aria-modal="true"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">Welcome to PM Assist</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Let&apos;s get you started 👋</h2>
            <p className="mt-2 text-sm text-slate-500">
              Follow these quick steps to explore your demo workspace and reach first value fast.
            </p>

            <ul className="mt-6 space-y-3">
              {CHECKLIST.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-600">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onStart}
                className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Get started
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
