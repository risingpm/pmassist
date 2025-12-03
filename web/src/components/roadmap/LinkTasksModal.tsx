import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listTasks, type TaskRecord } from "../../api";
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../styles/theme";

type LinkTasksModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  userId: string | null;
  projectId: string;
  initialTaskIds: string[];
  onLink: (taskIds: string[]) => Promise<void>;
};

export default function LinkTasksModal({
  open,
  onClose,
  workspaceId,
  userId,
  projectId,
  initialTaskIds,
  onLink,
}: LinkTasksModalProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTaskIds));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialTaskIds));
  }, [open, initialTaskIds]);

  useEffect(() => {
    if (!open || !workspaceId || !userId) return;
    setLoading(true);
    listTasks(workspaceId, userId, projectId)
      .then((data) => {
        setTasks(data);
        setError(null);
      })
      .catch((err) => setError(err.message || "Failed to load tasks"))
      .finally(() => setLoading(false));
  }, [open, workspaceId, userId, projectId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => task.project_id === projectId);
  }, [tasks, projectId]);

  const toggleTask = (taskId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onLink(Array.from(selected));
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update links");
    } finally {
      setSaving(false);
    }
  };

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
            className="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className={SECTION_LABEL}>Roadmap milestone</p>
                <h3 className="text-lg font-semibold text-slate-900">Link tasks</h3>
              </div>
              <button onClick={onClose} className={SECONDARY_BUTTON}>
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}
          {loading ? (
            <p className="text-sm text-slate-500">Loading tasks…</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredTasks.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks available for this project.</p>
              ) : (
                filteredTasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(task.id)}
                      onChange={() => toggleTask(task.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">{task.title}</p>
                      <p className="text-xs text-slate-500">
                        Status: {task.status.replace("_", " ")} {task.due_date ? `• Due ${new Date(task.due_date).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving || loading} className={PRIMARY_BUTTON}>
                  {saving ? "Saving..." : "Save links"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
