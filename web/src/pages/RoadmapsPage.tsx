import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { deleteRoadmap, deleteWorkspaceRoadmap, fetchWorkspaceRoadmap, getProjects } from "../api";
import { WORKSPACE_NAME_KEY } from "../constants";

type RoadmapIconName =
  | "back"
  | "header"
  | "plus"
  | "search"
  | "roadmapPrimary"
  | "roadmapSecondary"
  | "phases"
  | "clock"
  | "delete"
  | "left"
  | "right"
  | "doubleLeft"
  | "doubleRight";

function RoadmapIcon({ name, className }: { name: RoadmapIconName; className?: string }) {
  const sizeClass = className || "h-4 w-4";
  switch (name) {
    case "back":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M12.5 4.5L7 10l5.5 5.5" stroke="#101828" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "header":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4" width="14" height="12" rx="2" stroke="#7c3aed" strokeWidth="1.7" />
          <path d="M3 8h14" stroke="#7c3aed" strokeWidth="1.7" />
        </svg>
      );
    case "plus":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="5.25" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M13 13l3.5 3.5" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "roadmapPrimary":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="4" width="13" height="12" rx="2.5" stroke="white" strokeWidth="1.5" />
          <path d="M6 8h8M6 11h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "roadmapSecondary":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="3.5" y="4" width="13" height="12" rx="2.5" stroke="white" strokeWidth="1.5" />
          <path d="M6 8h5M6 11h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "phases":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M4 6h12M4 10h12M4 14h8" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="14.5" cy="14" r="1.5" fill="#6b7280" />
        </svg>
      );
    case "clock":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="6.5" stroke="#6b7280" strokeWidth="1.6" />
          <path d="M10 6.8v3.5l2.3 1.4" stroke="#6b7280" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "delete":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M5.5 6h9M8 6V4.7h4V6M7 8.2v6M10 8.2v6M13 8.2v6M6.3 6l.6 10h6.2l.6-10" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "left":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M12 5.5L7.5 10 12 14.5" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "right":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M8 5.5L12.5 10 8 14.5" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "doubleLeft":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M13 5.5L8.5 10 13 14.5M9.5 5.5L5 10l4.5 4.5" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "doubleRight":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M7 5.5L11.5 10 7 14.5M10.5 5.5L15 10l-4.5 4.5" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

type RoadmapProject = {
  id: string;
  title: string;
  description?: string | null;
  updated_at?: string | null;
};

const formatUpdatedAt = (iso?: string | null) => {
  if (!iso) return "Not updated";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

export default function RoadmapsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [workspaceRoadmapUpdatedAt, setWorkspaceRoadmapUpdatedAt] = useState<string | null>(null);
  const [workspaceRoadmapTitle, setWorkspaceRoadmapTitle] = useState<string>("Workspace roadmap");
  const [projects, setProjects] = useState<RoadmapProject[]>([]);
  const [hideWorkspaceRoadmap, setHideWorkspaceRoadmap] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: "workspace" | "project" } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");

  useEffect(() => {
    if (!workspaceId) return;
    if (typeof window !== "undefined") {
      const storedName = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
      if (storedName) {
        setWorkspaceRoadmapTitle(`${storedName} roadmap`);
      }
    }
    const fetchProjects = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [workspaceRoadmapResult, projectsResult] = await Promise.allSettled([
          fetchWorkspaceRoadmap(workspaceId),
          getProjects(workspaceId),
        ]);

        if (workspaceRoadmapResult.status === "fulfilled") {
          const workspaceRoadmap = workspaceRoadmapResult.value;
          const hasWorkspaceRoadmap = Boolean(workspaceRoadmap?.content?.trim());
          setWorkspaceRoadmapUpdatedAt(
            hasWorkspaceRoadmap ? (workspaceRoadmap?.updated_at || workspaceRoadmap?.created_at || null) : null
          );
          setHideWorkspaceRoadmap(!hasWorkspaceRoadmap);
        } else {
          setWorkspaceRoadmapUpdatedAt(null);
          setHideWorkspaceRoadmap(true);
        }

        if (projectsResult.status === "fulfilled") {
          const data = projectsResult.value;
          const list = Array.isArray(data) ? data : data?.projects ?? [];
          setProjects(
            list.map((project: any) => ({
              id: project.id,
              title: project.title,
              description: project.description,
              updated_at: project.last_updated || project.updated_at || project.created_at,
            }))
          );
        } else {
          throw projectsResult.reason;
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load roadmaps.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [workspaceId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const roadmapItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description?: string | null;
      updated_at?: string | null;
      type: "workspace" | "project";
    }> = [];
    if (!hideWorkspaceRoadmap) {
      items.push({
        id: "workspace",
        title: workspaceRoadmapTitle,
        description: "High-level roadmap across the workspace.",
        updated_at: workspaceRoadmapUpdatedAt,
        type: "workspace",
      });
    }
    projects.forEach((project) => {
      items.push({
        id: project.id,
        title: project.title,
        description: project.description,
        updated_at: project.updated_at,
        type: "project",
      });
    });
    return items;
  }, [projects, workspaceRoadmapTitle, workspaceRoadmapUpdatedAt]);

  const filteredRoadmaps = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return roadmapItems;
    return roadmapItems.filter((item) => {
      const name = item.title?.toLowerCase() || "";
      const desc = item.description?.toLowerCase() || "";
      return name.includes(query) || desc.includes(query);
    });
  }, [roadmapItems, searchValue]);

  const totalCount = roadmapItems.length;
  const filteredCount = filteredRoadmaps.length;
  const showingStart = filteredCount > 0 ? 1 : 0;
  const showingEnd = filteredCount;

  const handleDeleteRoadmap = async () => {
    if (!workspaceId || !pendingDelete) return;
    setIsDeleting(true);
    setModalError(null);
    try {
      if (pendingDelete.type === "workspace") {
        await deleteWorkspaceRoadmap(workspaceId);
        setHideWorkspaceRoadmap(true);
      } else {
        await deleteRoadmap(pendingDelete.id, workspaceId);
        setProjects((current) => current.filter((project) => project.id !== pendingDelete.id));
      }
      setToastTone("success");
      setToastMessage("Roadmap deleted.");
      setPendingDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete roadmap.";
      setModalError(message);
      setToastTone("error");
      setToastMessage(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#e5e7eb]">
        <div className="px-8 py-4">
          <div className="flex h-[48px] items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] font-medium tracking-[-0.1504px] text-[#0a0a0a]"
                onClick={() => {
                  if (workspaceId) {
                    navigate(`/workspaces/${workspaceId}/home`);
                    return;
                  }
                  navigate(-1);
                }}
              >
                <RoadmapIcon name="back" className="h-4 w-4" />
                Back
              </button>
              <div className="h-6 w-px bg-[#d1d5dc]" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f3e8ff]">
                  <RoadmapIcon name="header" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">Roadmaps</p>
                  <p className="text-[14px] text-[#6a7282]">{totalCount} total roadmaps</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[14px] font-medium tracking-[-0.1504px] text-white"
              onClick={() => {
                if (!workspaceId) return;
                navigate(`/workspaces/${workspaceId}/roadmaps/new`);
              }}
            >
              <span className="text-white">
                <RoadmapIcon name="plus" className="h-4 w-4" />
              </span>
              New Roadmap
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-[#e5e7eb] bg-white px-8 py-4">
        <div className="relative flex h-9 w-full max-w-[448px] items-center rounded-[8px] bg-[#f3f3f5] pl-9 pr-3 text-[14px] text-[#717182]">
          <RoadmapIcon name="search" className="absolute left-3 h-4 w-4" />
          <input
            className="w-full bg-transparent text-[14px] text-[#101828] outline-none placeholder:text-[#717182]"
            placeholder="Search roadmaps..."
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </div>
      </div>

      <main className="min-h-[calc(100vh-150px)] bg-[#f9fafb] px-8 py-8">
        {isLoading && (
          <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-6 py-4 text-[14px] text-[#6a7282]">
            Loading roadmaps...
          </div>
        )}
        {errorMessage && (
          <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-6 py-4 text-[14px] text-[#fb2c36]">
            {errorMessage}
          </div>
        )}
        {!isLoading && !errorMessage && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
              <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,2.45fr)_120px_170px_120px] border-b border-[#e5e7eb] bg-[#f9fafb] text-[12px] font-semibold uppercase tracking-[0.6px] text-[#4a5565]">
                <div className="px-6 py-3">Roadmap Title</div>
                <div className="px-6 py-3">Description</div>
                <div className="px-6 py-3">Phases</div>
                <div className="px-6 py-3">Last Updated</div>
                <div className="px-6 py-3 text-right">Actions</div>
              </div>
              <div>
                {filteredRoadmaps.map((item, index) => {
                  const phasesCount = item.type === "workspace" ? 2 : 1;
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="group grid cursor-pointer grid-cols-[minmax(0,1.45fr)_minmax(0,2.45fr)_120px_170px_120px] border-b border-[#e5e7eb] px-0 py-0 last:border-b-0"
                      onClick={() => {
                        if (!workspaceId) return;
                        if (item.type === "workspace") {
                          navigate(`/workspaces/${workspaceId}/roadmaps/new`);
                        } else {
                          navigate(`/workspaces/${workspaceId}/roadmaps/${item.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 px-6 py-5">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                          style={{
                            backgroundImage:
                              "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(43, 127, 255, 1) 100%)",
                          }}
                        >
                          <RoadmapIcon
                            name={index % 2 === 0 ? "roadmapPrimary" : "roadmapSecondary"}
                            className="h-4 w-4"
                          />
                        </div>
                        <p className="text-[16px] font-medium tracking-[-0.3125px] text-[#101828]">
                          {item.title}
                        </p>
                      </div>
                      <div className="px-6 py-4 text-[14px] text-[#4a5565]">
                        {item.description || "No description yet."}
                      </div>
                      <div className="flex items-center gap-1 px-6 py-4 text-[14px] text-[#4a5565]">
                        <RoadmapIcon name="phases" className="h-4 w-4" />
                        {phasesCount}
                      </div>
                      <div className="flex items-center gap-1 px-6 py-4 text-[14px] text-[#4a5565]">
                        <RoadmapIcon name="clock" className="h-4 w-4" />
                        {formatUpdatedAt(item.updated_at)}
                      </div>
                      <div className="flex items-center justify-end px-6 py-4">
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDelete({ id: item.id, type: item.type });
                          }}
                        >
                          <RoadmapIcon name="delete" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 text-[14px] text-[#4a5565]">
              <p>
                Showing {showingStart}-{showingEnd} of {totalCount} roadmaps
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Rows per page:</span>
                  <div className="flex h-[33px] w-[64px] items-center rounded-[10px] border border-[#d1d5dc] bg-white px-3 text-[14px] text-[#0a0a0a]">
                    5
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="relative flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white opacity-50"
                  >
                    <RoadmapIcon name="doubleLeft" className="absolute left-[2px] h-4 w-4" />
                    <RoadmapIcon name="doubleLeft" className="absolute left-[12px] h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white opacity-50"
                  >
                    <RoadmapIcon name="left" className="h-4 w-4" />
                  </button>
                  <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white">
                    1
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white opacity-50"
                  >
                    <RoadmapIcon name="right" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="relative flex h-8 w-8 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white opacity-50"
                  >
                    <RoadmapIcon name="doubleRight" className="absolute left-[2px] h-4 w-4" />
                    <RoadmapIcon name="doubleRight" className="absolute left-[12px] h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      {pendingDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setPendingDelete(null)}
            aria-label="Close delete confirmation"
          />
          <div className="relative w-[512px] rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white p-[25px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
            <div className="flex flex-col gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.4395px] text-[#0a0a0a]">
                Are you absolutely sure?
              </h2>
              <p className="text-[14px] text-[#717182]">
                This action cannot be undone. This will permanently delete the roadmap.
              </p>
            </div>
            {modalError && (
              <p className="mt-3 text-[13px] text-[#fb2c36]">{modalError}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-9 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-4 text-[14px] font-medium text-[#0a0a0a]"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 rounded-[8px] bg-[#030213] px-4 text-[14px] font-medium text-white disabled:opacity-70"
                onClick={handleDeleteRoadmap}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && (
        <div className="fixed left-1/2 top-6 z-[80] -translate-x-1/2" role="status" aria-live="polite">
          <div
            className={`rounded-[10px] px-4 py-3 text-[14px] font-medium shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] ${
              toastTone === "success" ? "bg-[#16a34a] text-white" : "bg-[#fb2c36] text-white"
            }`}
          >
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}
