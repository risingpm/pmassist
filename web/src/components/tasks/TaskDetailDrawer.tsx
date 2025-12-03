import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TaskComment, TaskRecord } from "../../api";
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, PILL_META, SURFACE_MUTED, BODY_SUBTLE } from "../../styles/theme";

type TaskDetailDrawerProps = {
  task: TaskRecord | null;
  comments: TaskComment[];
  open: boolean;
  onClose: () => void;
  onAddComment: (content: string) => Promise<void> | void;
  loading?: boolean;
  canEdit?: boolean;
  onEdit?: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => Promise<void> | void;
  deleting?: boolean;
};

export default function TaskDetailDrawer({
  task,
  comments,
  open,
  onClose,
  onAddComment,
  loading = false,
  canEdit = false,
  onEdit,
  onDelete,
  deleting = false,
}: TaskDetailDrawerProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setComment("");
    }
  }, [open]);

  if (!task) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(comment.trim());
      setComment("");
    } finally {
      setSubmitting(false);
    }
  };

  const hasContext = Boolean(task.kb_entry_id || task.prd_id || task.roadmap_id);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex-1 pr-3">
                <p className={SECTION_LABEL}>Task</p>
                <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={PILL_META}>Priority: {task.priority}</span>
                  <span className={PILL_META}>Status: {task.status.replace("_", " ")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <button type="button" onClick={() => onEdit?.(task)} className={SECONDARY_BUTTON}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete?.(task)}
                      disabled={deleting}
                      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                    >
                      {deleting ? "Removing…" : "Delete"}
                    </button>
                  </>
                )}
                <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600">
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
              {task.description && (
                <div>
                  <p className={SECTION_LABEL}>Description</p>
                  <p className={`mt-2 whitespace-pre-wrap ${BODY_SUBTLE}`}>{task.description}</p>
                </div>
              )}
              <div className={`${SURFACE_MUTED} grid gap-3 p-4 text-xs text-slate-500 sm:grid-cols-2`}>
                {task.due_date && (
                  <p>
                    <span className="font-semibold text-slate-700">Due</span>
                    <br />
                    {new Date(task.due_date).toLocaleDateString()}
                  </p>
                )}
                {task.assignee_id && (
                  <p>
                    <span className="font-semibold text-slate-700">Assignee</span>
                    <br />
                    {task.assignee_id.slice(0, 8)}
                  </p>
                )}
                {task.ai_generated && (
                  <p>
                    <span className="font-semibold text-slate-700">Created by</span>
                    <br />
                    AI assistance
                  </p>
                )}
                {hasContext && (
                  <p>
                    <span className="font-semibold text-slate-700">Linked context</span>
                    <br />
                    {task.kb_entry_id && <span className="mr-2 rounded-full bg-white px-2 py-0.5">KB</span>}
                    {task.prd_id && <span className="mr-2 rounded-full bg-white px-2 py-0.5">PRD</span>}
                    {task.roadmap_id && <span className="rounded-full bg-white px-2 py-0.5">Roadmap</span>}
                  </p>
                )}
              </div>
              <div>
                <p className={SECTION_LABEL}>Comments</p>
                <div className="mt-3 space-y-3">
                  {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
                  {comments.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p>{item.content}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSubmit} className="mt-4 space-y-2">
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Add a comment"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm shadow-inner focus:border-blue-500 focus:outline-none"
                    rows={3}
                    disabled={loading || submitting}
                  />
                  <button type="submit" disabled={loading || submitting} className={`${PRIMARY_BUTTON} w-full justify-center`}>
                    Comment
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
