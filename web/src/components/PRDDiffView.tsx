import { memo } from "react";
import type { PRDDiffResponse } from "../api";
import { motion, AnimatePresence } from "framer-motion";

type PRDDiffViewProps = {
  diff: PRDDiffResponse | null;
  loading?: boolean;
  summary?: string | null;
  summarizing?: boolean;
  onSummarize?: () => void;
  onClose?: () => void;
  className?: string;
};

const typeClasses: Record<string, string> = {
  equal: "bg-white text-slate-700",
  insert: "bg-emerald-50 text-emerald-700",
  delete: "bg-rose-50 text-rose-700",
  replace: "bg-amber-50 text-amber-700",
};

function DiffLine({ row }: { row: PRDDiffResponse["diff"][number] }) {
  const rowClass = typeClasses[row.type] || typeClasses.equal;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className={`grid grid-cols-2 gap-2 rounded-xl px-3 py-2 text-sm ${rowClass}`}
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
          {row.left_number ?? "—"}
        </p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{row.left_line ?? ""}</pre>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
          {row.right_number ?? "—"}
        </p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{row.right_line ?? ""}</pre>
      </div>
    </motion.div>
  );
}

const MemoDiffLine = memo(DiffLine);

export default function PRDDiffView({
  diff,
  loading,
  summary,
  summarizing,
  onSummarize,
  onClose,
  className,
}: PRDDiffViewProps) {
  return (
    <section className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Compare versions</p>
          <h3 className="text-lg font-semibold text-slate-900">
            {diff ? `v${diff.version_a} ↔ v${diff.version_b}` : "Select two versions"}
          </h3>
        </div>
        {onClose && diff && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Clear diff
          </button>
        )}
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading diff…</p>}
      {!loading && !diff && <p className="mt-4 text-sm text-slate-500">Choose two versions from history to see differences.</p>}

      {diff && !loading && (
        <>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2">
            <AnimatePresence initial={false}>
              {diff.diff.map((row, index) => (
                <MemoDiffLine key={`${row.type}-${index}-${row.left_number}-${row.right_number}`} row={row} />
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">AI summary of changes</p>
              {onSummarize && (
                <button
                  type="button"
                  onClick={onSummarize}
                  disabled={summarizing}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {summarizing ? "Summarizing..." : "Summarize differences"}
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {summary || "No summary yet. Ask the AI for a high-level explanation of these changes."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
