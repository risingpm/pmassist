import { useState } from "react";
import type { TaskGenerationItem } from "../../api";

type GenerateTasksModalProps = {
  open: boolean;
  onClose: () => void;
  onGenerate: (instructions: string) => Promise<TaskGenerationItem[]>;
  onConfirm: (tasks: TaskGenerationItem[]) => Promise<void>;
};

export default function GenerateTasksModal({ open, onClose, onGenerate, onConfirm }: GenerateTasksModalProps) {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<TaskGenerationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks = await onGenerate(instructions);
      setGenerated(tasks);
    } catch (err: any) {
      setError(err.message || "Failed to generate tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (generated.length === 0) return;
    await onConfirm(generated);
    setGenerated([]);
    setInstructions("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Generate Tasks</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Provide additional instructions for the AI. The assistant will use the project context automatically.
        </p>
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          rows={3}
          placeholder="e.g. Focus on onboarding flow and include both backend and UI tasks."
        />
        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
          {generated.length > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Add {generated.length} Tasks
            </button>
          )}
        </div>
        {generated.length > 0 && (
          <div className="mt-5 space-y-3 max-h-64 overflow-y-auto">
            {generated.map((task, idx) => (
              <div key={`${task.title}-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">{task.title}</p>
                <p className="mt-1 text-slate-600">{task.description}</p>
                <div className="mt-2 flex gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-white px-2 py-0.5 capitalize">{task.priority}</span>
                  {task.effort && (
                    <span className="rounded-full bg-white px-2 py-0.5">Effort: {task.effort}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
