import type { TaskRecord } from "../../api";

type TaskCardProps = {
  task: TaskRecord;
  onSelect?: (task: TaskRecord) => void;
};

export default function TaskCard({ task, onSelect }: TaskCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(task)}
      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="font-semibold text-slate-900">{task.title}</p>
      {task.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{task.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{task.priority}</span>
        {task.assignee_id && <span className="rounded-full bg-slate-100 px-2 py-0.5">Assignee: {task.assignee_id.slice(0, 6)}</span>}
      </div>
    </button>
  );
}
