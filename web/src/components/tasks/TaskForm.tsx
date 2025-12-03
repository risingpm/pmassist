import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TaskPayload, TaskPriority, TaskRecord, TaskStatus } from "../../api";
import { SURFACE_CARD, SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../styles/theme";

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type TaskFormProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskPayload) => Promise<void> | void;
  initialTask?: TaskRecord | null;
};

export default function TaskForm({ open, onClose, onSubmit, initialTask }: TaskFormProps) {
  const [form, setForm] = useState<TaskPayload>({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    due_date: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTask) {
      const dateValue = initialTask.due_date ? initialTask.due_date.slice(0, 10) : "";
      setForm({
        title: initialTask.title,
        description: initialTask.description ?? "",
        status: initialTask.status,
        priority: initialTask.priority,
        due_date: dateValue,
      });
    } else {
      setForm({
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        due_date: "",
      });
    }
  }, [open, initialTask]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const dueDateIso = form.due_date ? new Date(form.due_date).toISOString() : undefined;
      await onSubmit({
        ...form,
        due_date: dueDateIso,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`${SURFACE_CARD} w-full max-w-lg p-6 shadow-2xl`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{initialTask ? "Edit Task" : "New Task"}</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
            ✕
          </button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700">
            <span className={SECTION_LABEL}>Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none"
              placeholder="Describe the work item"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            <span className={SECTION_LABEL}>Description</span>
            <textarea
              value={form.description ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none"
              rows={4}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              <span className={SECTION_LABEL}>Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className={SECTION_LABEL}>Priority</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            <span className={SECTION_LABEL}>Due date</span>
            <input
              type="date"
              value={form.due_date ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Saving..." : initialTask ? "Update Task" : "Create Task"}
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
