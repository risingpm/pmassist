import { useEffect, useState } from "react";
import {
  createRoadmapMilestone,
  createRoadmapPhase,
  deleteRoadmapMilestone,
  deleteRoadmapPhase,
  getRoadmapPhases,
  linkMilestoneTask,
  type RoadmapMilestone,
  type RoadmapPhase,
  type RoadmapPhasePayload,
  type RoadmapMilestonePayload,
} from "../../api";
import RoadmapProgressBar from "./RoadmapProgressBar";
import LinkTasksModal from "./LinkTasksModal";
import PhaseFeedbackModal from "./PhaseFeedbackModal";

type RoadmapPhaseViewProps = {
  projectId: string;
  workspaceId: string | null;
  userId: string | null;
  canEdit: boolean;
  refreshKey: number;
  onChanged: () => void;
};

type DraftPhase = RoadmapPhasePayload & { id?: string };
type DraftMilestone = RoadmapMilestonePayload & { phase_id: string };

export default function RoadmapPhaseView({
  projectId,
  workspaceId,
  userId,
  canEdit,
  refreshKey,
  onChanged,
}: RoadmapPhaseViewProps) {
  const [phases, setPhases] = useState<RoadmapPhase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<DraftPhase>({ title: "" });
  const [milestoneDraft, setMilestoneDraft] = useState<DraftMilestone | null>(null);
  const [linkModal, setLinkModal] = useState<{ milestone: RoadmapMilestone | null }>({ milestone: null });
  const [feedbackPhaseId, setFeedbackPhaseId] = useState<string | null>(null);

  const loadPhases = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await getRoadmapPhases(projectId, workspaceId);
      setPhases(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load roadmap");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspaceId, refreshKey]);

  const handleAddPhase = async () => {
    if (!workspaceId || !phaseDraft.title.trim()) return;
    try {
      await createRoadmapPhase(projectId, workspaceId, { ...phaseDraft, order_index: phases.length });
      setPhaseDraft({ title: "" });
      loadPhases();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to add phase");
    }
  };

  const handleAddMilestone = async () => {
    if (!workspaceId || !milestoneDraft) return;
    try {
      await createRoadmapMilestone(projectId, milestoneDraft.phase_id, workspaceId, milestoneDraft);
      setMilestoneDraft(null);
      loadPhases();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to add milestone");
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!workspaceId) return;
    if (!window.confirm("Delete this phase and all milestones?")) return;
    await deleteRoadmapPhase(projectId, phaseId, workspaceId);
    loadPhases();
    onChanged();
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!workspaceId) return;
    if (!window.confirm("Delete this milestone?")) return;
    await deleteRoadmapMilestone(projectId, milestoneId, workspaceId);
    loadPhases();
    onChanged();
  };

  const openLinkModal = (milestone: RoadmapMilestone) => {
    setLinkModal({ milestone });
  };

  const handleLinkTasks = async (taskIds: string[]) => {
    if (!workspaceId || !linkModal.milestone) return;
    const existingIds = new Set(linkModal.milestone.linked_tasks.map((task) => task.id));
    const desired = new Set(taskIds);
    const toAdd = Array.from(desired).filter((id) => !existingIds.has(id));
    const toRemove = Array.from(existingIds).filter((id) => !desired.has(id));
    await Promise.all([
      ...toAdd.map((id) => linkMilestoneTask(projectId, linkModal.milestone!.id, workspaceId, id, "link")),
      ...toRemove.map((id) => linkMilestoneTask(projectId, linkModal.milestone!.id, workspaceId, id, "unlink")),
    ]);
    setLinkModal({ milestone: null });
    loadPhases();
    onChanged();
  };

  const canShowActions = canEdit && workspaceId;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Roadmap</p>
          <h3 className="text-lg font-semibold text-slate-900">Multi-phase plan</h3>
        </div>
        {canShowActions && (
          <div className="flex gap-2">
            <input
              type="text"
              value={phaseDraft.title}
              onChange={(event) => setPhaseDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Add phase..."
              className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddPhase}
              disabled={!phaseDraft.title.trim()}
              className="rounded-full bg-slate-900 px-4 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading phases…</p>
      ) : phases.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No phases yet. Start by creating your first phase.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {phases.map((phase) => (
            <div key={phase.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{phase.status}</p>
                  <h4 className="text-lg font-semibold text-slate-900">{phase.title}</h4>
                  {phase.description && <p className="mt-1 text-sm text-slate-500">{phase.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {phase.due_date && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      Due {new Date(phase.due_date).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFeedbackPhaseId(phase.id)}
                    className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    AI retrospective
                  </button>
                  {canShowActions && (
                    <button
                      type="button"
                      onClick={() => handleDeletePhase(phase.id)}
                      className="rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <RoadmapProgressBar value={phase.progress_percent} />
              </div>
              {phase.milestones.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No milestones yet.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {phase.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-inner"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{milestone.title}</p>
                          {milestone.description && (
                            <p className="text-xs text-slate-500">{milestone.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {milestone.due_date && (
                            <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                              Due {new Date(milestone.due_date).toLocaleDateString()}
                            </span>
                          )}
                          <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                            {milestone.status}
                          </span>
                          {canShowActions && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMilestone(milestone.id)}
                              className="rounded-full border border-rose-200 px-3 py-1 font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <RoadmapProgressBar value={milestone.progress_percent} />
                      </div>
                      <div className="mt-3 space-y-2 text-sm">
                        {milestone.linked_tasks.length === 0 ? (
                          <p className="text-xs text-slate-500">No tasks linked.</p>
                        ) : (
                          milestone.linked_tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <span className="font-semibold text-slate-800">{task.title}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  task.status === "done"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : task.status === "in_progress"
                                      ? "bg-amber-50 text-amber-600"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {task.status.replace("_", " ")}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      {canShowActions && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => openLinkModal(milestone)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
                          >
                            Link tasks
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canShowActions && (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 p-3">
                  {milestoneDraft?.phase_id === phase.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={milestoneDraft.title}
                        onChange={(event) =>
                          setMilestoneDraft((prev) => prev && { ...prev, title: event.target.value })
                        }
                        placeholder="Milestone title"
                        className="w-full rounded-full border border-slate-200 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      <textarea
                        value={milestoneDraft.description ?? ""}
                        onChange={(event) =>
                          setMilestoneDraft((prev) => prev && { ...prev, description: event.target.value })
                        }
                        placeholder="Optional description"
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setMilestoneDraft(null)}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddMilestone}
                          disabled={!milestoneDraft.title.trim()}
                          className="rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMilestoneDraft({ phase_id: phase.id, title: "" })}
                      className="text-xs font-semibold text-slate-600"
                    >
                      + Add milestone
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {linkModal.milestone && workspaceId && (
        <LinkTasksModal
          open
          onClose={() => setLinkModal({ milestone: null })}
          workspaceId={workspaceId}
          userId={userId}
          projectId={projectId}
          initialTaskIds={linkModal.milestone.linked_tasks.map((task) => task.id)}
          onLink={handleLinkTasks}
        />
      )}
      {feedbackPhaseId && workspaceId && (
        <PhaseFeedbackModal
          open
          onClose={() => setFeedbackPhaseId(null)}
          projectId={projectId}
          phaseId={feedbackPhaseId}
          workspaceId={workspaceId}
        />
      )}
    </section>
  );
}
