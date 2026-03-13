import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { deletePrd, deleteWorkspacePrd, getWorkspacePrds } from "../api";
import type { PRDListItem } from "../api";

type PrdIconName =
  | "back"
  | "header"
  | "plus"
  | "search"
  | "doc"
  | "saved"
  | "draft"
  | "message"
  | "clock"
  | "delete"
  | "empty";

function PrdIcon({ name, className }: { name: PrdIconName; className?: string }) {
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
    case "doc":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <rect x="4" y="2.5" width="12" height="15" rx="2" stroke="#8b5cf6" strokeWidth="1.4" />
          <path d="M7 7h6M7 10h6M7 13h4" stroke="#8b5cf6" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "saved":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" fill="#16a34a" />
          <path d="M6.8 10.3l2.2 2.1 4.2-4.3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "draft":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" fill="#ca8a04" />
          <path d="M10 6.5v4M10 13.2h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "message":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 20 20" fill="none">
          <path d="M4 5.5h12v8H8l-4 2v-10Z" stroke="#6b7280" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="8" cy="9.2" r="0.9" fill="#6b7280" />
          <circle cx="10" cy="9.2" r="0.9" fill="#6b7280" />
          <circle cx="12" cy="9.2" r="0.9" fill="#6b7280" />
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
    case "empty":
      return (
        <svg aria-hidden="true" className={sizeClass} viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="20" rx="4" stroke="#8b5cf6" strokeWidth="2" />
          <path d="M10 12h12M10 17h9" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function PrdsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [activeTab, setActiveTab] = useState<"all" | "draft" | "saved">("all");
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearchValue, setDebouncedSearchValue] = useState("");
  const [prds, setPrds] = useState<PRDListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PRDListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");

  const projectColors = ["#ad46ff", "#2b7fff", "#00c950", "#f97316", "#06b6d4"];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchValue(searchValue.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    if (!workspaceId) return;
    const fetchPrds = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await getWorkspacePrds(
          workspaceId,
          activeTab === "all" ? undefined : activeTab,
          debouncedSearchValue || undefined
        );
        setPrds(data);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load PRDs.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPrds();
  }, [workspaceId, activeTab, debouncedSearchValue]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const prdCount = prds.length;
  const hasPrds = prds.length > 0;

  const formatUpdatedAt = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const projectDotColor = (name?: string | null) => {
    if (!name) return "#99a1af";
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash + name.charCodeAt(i) * (i + 1)) % projectColors.length;
    }
    return projectColors[hash];
  };

  const handleDeletePrd = async () => {
    if (!workspaceId || !pendingDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    setModalError(null);
    try {
      if (pendingDelete.project_id) {
        await deletePrd(pendingDelete.project_id, pendingDelete.id, workspaceId);
      } else {
        await deleteWorkspacePrd(pendingDelete.id, workspaceId);
      }
      setPrds((current) => current.filter((prd) => prd.id !== pendingDelete.id));
      setToastTone("success");
      setToastMessage("PRD deleted.");
      setPendingDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete PRD.";
      setErrorMessage(message);
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
                <PrdIcon name="back" className="h-4 w-4" />
                Back
              </button>
              <div className="h-6 w-px bg-[#d1d5dc]" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f3e8ff]">
                  <PrdIcon name="header" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">PRDs</p>
                  <p className="text-[14px] text-[#6a7282]">{prdCount} total PRDs</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 text-[14px] font-medium tracking-[-0.1504px] text-white"
              onClick={() => {
                if (workspaceId) {
                  navigate(`/workspaces/${workspaceId}/prd/new`);
                }
              }}
            >
              <span className="text-white">
                <PrdIcon name="plus" className="h-4 w-4" />
              </span>
              New PRD
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-[#e5e7eb] bg-white px-8 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex h-9 w-full max-w-[448px] items-center rounded-[8px] bg-[#f3f3f5] pl-9 pr-3 text-[14px] text-[#717182]">
            <PrdIcon name="search" className="absolute left-3 h-4 w-4" />
            <input
              className="w-full bg-transparent text-[14px] text-[#101828] outline-none placeholder:text-[#717182]"
              placeholder="Search PRDs..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`h-8 rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.1504px] ${
              activeTab === "all"
                ? "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white"
                : "border border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("draft")}
            className={`h-8 rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.1504px] ${
              activeTab === "draft"
                ? "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white"
                : "border border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a]"
            }`}
          >
            Drafts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("saved")}
            className={`h-8 rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.1504px] ${
              activeTab === "saved"
                ? "bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-white"
                : "border border-[rgba(0,0,0,0.1)] bg-white text-[#0a0a0a]"
            }`}
          >
            Saved
          </button>
        </div>
        </div>
      </div>

      <main className="min-h-[calc(100vh-150px)] bg-[#f9fafb] px-8 py-8">
        {isLoading && (
          <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-6 py-4 text-[14px] text-[#6a7282]">
            Loading PRDs...
          </div>
        )}
        {errorMessage && (
          <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-6 py-4 text-[14px] text-[#fb2c36]">
            {errorMessage}
          </div>
        )}
        {!isLoading && !errorMessage && !hasPrds && (
          <div className="flex min-h-[520px] items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white">
            <div className="flex w-full max-w-[320px] flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f3e8ff]">
                <PrdIcon name="empty" className="h-10 w-10" />
              </div>
              <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.4492px] text-[#101828]">
                No PRDs yet
              </h2>
              <p className="mt-2 text-[14px] text-[#6a7282]">
                Start creating your first PRD with AI assistance
              </p>
              <button
                type="button"
                className="mt-6 flex h-9 items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-[14px] font-medium tracking-[-0.1504px] text-white"
                onClick={() => {
                  if (workspaceId) {
                    navigate(`/workspaces/${workspaceId}/prd/new`);
                  }
                }}
              >
                <span className="text-white">
                  <PrdIcon name="plus" className="h-4 w-4" />
                </span>
                Create Your First PRD
              </button>
            </div>
          </div>
        )}
        {!isLoading && !errorMessage && hasPrds && (
          <div className="rounded-[10px] border border-[#e5e7eb] bg-white">
            <div className="grid grid-cols-[1.4fr_0.3fr_0.4fr_0.25fr_0.3fr_0.15fr] border-b border-[#e5e7eb] bg-[#f9fafb] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.6px] text-[#4a5565]">
              <span>PRD TITLE</span>
              <span>Status</span>
              <span>Project</span>
              <span>Messages</span>
              <span>Last Updated</span>
              <span className="text-right">Actions</span>
            </div>
            {prds.map((prd) => (
              <div
                key={prd.id}
                className="grid cursor-pointer grid-cols-[1.4fr_0.3fr_0.4fr_0.25fr_0.3fr_0.15fr] items-center border-b border-[#e5e7eb] px-6 py-4 text-[14px] text-[#101828]"
                onClick={() => {
                  if (workspaceId) {
                    navigate(`/workspaces/${workspaceId}/prd/${prd.id}`);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#faf5ff]">
                    <PrdIcon name="doc" className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[16px] font-medium tracking-[-0.3125px] text-[#101828]">
                      {prd.feature_name || "Untitled PRD"}
                    </p>
                    <p className="max-w-[520px] truncate text-[14px] text-[#6a7282]">
                      {prd.description || "No summary yet."}
                    </p>
                  </div>
                </div>
                <div>
                  {prd.status === "saved" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-3 py-1 text-[12px] font-medium text-[#008236]">
                      <PrdIcon name="saved" className="h-3 w-3" />
                      Saved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fef9c2] px-3 py-1 text-[12px] font-medium text-[#a65f00]">
                      <PrdIcon name="draft" className="h-3 w-3" />
                      Draft
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[14px] text-[#364153]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: projectDotColor(prd.project_title) }} />
                  {prd.project_title || "No project"}
                </div>
                <div className="flex items-center gap-1 text-[14px] text-[#4a5565]">
                  <PrdIcon name="message" className="h-4 w-4" />
                  {prd.message_count}
                </div>
                <div className="flex items-center gap-1 text-[14px] text-[#4a5565]">
                  <PrdIcon name="clock" className="h-4 w-4" />
                  {formatUpdatedAt(prd.updated_at)}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="flex h-8 w-9 items-center justify-center rounded-[8px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDelete(prd);
                    }}
                    aria-label={`Delete ${prd.feature_name || "PRD"}`}
                  >
                    <PrdIcon name="delete" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setPendingDelete(null)}
            aria-label="Close delete confirmation"
          />
          <div className="relative w-[512px] rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white p-[25px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
            <div className="flex flex-col gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.4395px] text-[#0a0a0a]">
                Are you absolutely sure?
              </h2>
              <p className="text-[14px] text-[#717182]">
                This action cannot be undone. This will permanently delete the PRD.
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
                onClick={handleDeletePrd}
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
