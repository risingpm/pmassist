import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import type { TaskRecord, TaskStatus } from "../../api";
import { SURFACE_CARD, SECTION_LABEL, PILL_META } from "../../styles/theme";

export const KANBAN_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

const STATUS_COLUMNS: Record<TaskStatus, { title: string; accent: string }> = {
  todo: { title: "To Do", accent: "border-slate-200" },
  in_progress: { title: "In Progress", accent: "border-amber-300" },
  done: { title: "Done", accent: "border-emerald-300" },
};

export type KanbanMovePayload = {
  taskId: string;
  sourceStatus: TaskStatus;
  destinationStatus: TaskStatus;
  sourceIndex: number;
  destinationIndex: number;
};

type KanbanBoardProps = {
  tasks: TaskRecord[];
  onMoveTask: (payload: KanbanMovePayload) => void;
  onSelectTask?: (task: TaskRecord) => void;
  canDrag?: boolean;
};

export default function KanbanBoard({ tasks, onMoveTask, onSelectTask, canDrag = true }: KanbanBoardProps) {
  const grouped = KANBAN_STATUSES.reduce<Record<TaskStatus, TaskRecord[]>>(
    (acc, status) => {
      acc[status] = tasks.filter((task) => task.status === status);
      return acc;
    },
    { todo: [], in_progress: [], done: [] }
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (!canDrag) return;
    const { draggableId, destination, source } = result;
    const destinationStatus = destination.droppableId as TaskStatus;
    const sourceStatus = source.droppableId as TaskStatus;
    if (destinationStatus === sourceStatus && destination.index === source.index) return;
    onMoveTask({
      taskId: draggableId,
      sourceStatus,
      destinationStatus,
      sourceIndex: source.index,
      destinationIndex: destination.index,
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {KANBAN_STATUSES.map((status) => {
          const column = STATUS_COLUMNS[status];
          return (
            <div key={status} className={`${SURFACE_CARD} flex flex-col p-4`}>
              <div className="flex items-center justify-between">
                <p className={SECTION_LABEL}>{column.title}</p>
                <span className={PILL_META}>{grouped[status].length}</span>
              </div>
              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`mt-3 flex-1 rounded-2xl border border-dashed bg-slate-50/80 p-3 transition ${
                      snapshot.isDraggingOver ? "border-blue-300 bg-white" : column.accent
                    }`}
                  >
                    {grouped[status].map((task, index) => (
                      <Draggable
                        key={task.id}
                        draggableId={task.id}
                        index={index}
                        isDragDisabled={!canDrag}
                        disableInteractiveElementBlocking
                      >
                        {(draggableProvided) => (
                          <button
                            type="button"
                            onClick={() => onSelectTask?.(task)}
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            {...draggableProvided.dragHandleProps}
                            className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm last:mb-0"
                            title={
                              task.kb_entry_id
                                ? "Linked Knowledge Base entry"
                                : task.prd_id
                                ? "Linked PRD"
                                : task.roadmap_id
                                ? "Linked roadmap"
                                : undefined
                            }
                          >
                            <p className="font-semibold text-slate-900">{task.title}</p>
                            {task.description && (
                              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{task.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">
                                {task.priority}
                              </span>
                              {task.due_date && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                  Due {new Date(task.due_date).toLocaleDateString()}
                                </span>
                              )}
                              {task.kb_entry_id && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">KB</span>
                              )}
                              {task.prd_id && (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">PRD</span>
                              )}
                              {task.roadmap_id && (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">Roadmap</span>
                              )}
                            </div>
                          </button>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
