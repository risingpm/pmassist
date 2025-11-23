import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getPrd, refinePrd, exportPrd, deletePrd, type ProjectRole, type KnowledgeBaseContextItem } from "../api";
import ContextUsedPanel from "./ContextUsedPanel";

type PRDDetailProps = {
  projectId: string;
  prdId: string;
  workspaceId: string | null;
  projectRole: ProjectRole;
  onBack: () => void;
};

export default function PRDDetail({ projectId, prdId, workspaceId, projectRole, onBack }: PRDDetailProps) {
  const [prd, setPrd] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canEdit = projectRole === "owner" || projectRole === "contributor";
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);

  // Fetch PRD when component mounts
  useEffect(() => {
    const fetchPrd = async () => {
      if (!workspaceId) {
        setError("Workspace context missing. Go back and select a workspace.");
        return;
      }
    setLoading(true);
    try {
      const data = await getPrd(projectId, prdId, workspaceId);
      setPrd(data);
      setContextEntries(data.context_entries ?? []);
      setError(null);
    } catch (err) {
      console.error("Failed to load PRD:", err);
      setError("⚠️ Failed to load PRD");
    } finally {
        setLoading(false);
      }
    };

    fetchPrd();
  }, [projectId, prdId, workspaceId]);

  // Handle refinement
  const handleRefine = async () => {
    if (!refineText.trim() || !canEdit) return;
    setLoading(true);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      const refined = await refinePrd(projectId, prdId, workspaceId, refineText);
      setPrd(refined);
      setContextEntries(refined.context_entries ?? []);
      setRefineText("");
      setError(null);
      setSuccess("✅ PRD refined successfully");
    } catch (err) {
      console.error("Failed to refine PRD:", err);
      setError("⚠️ Failed to refine PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      await exportPrd(projectId, prdId, workspaceId);
      setError(null);
      setSuccess("📤 Export started");
    } catch (err) {
      console.error("Failed to export PRD:", err);
      setError("⚠️ Failed to export PRD");
      setSuccess(null);
    }
  };

  const handleDelete = async () => {
    if (!canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    const confirmed = window.confirm("Delete this PRD? This action cannot be undone.");
    if (!confirmed) return;

    setLoading(true);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      await deletePrd(projectId, prdId, workspaceId);
      setError(null);
      setSuccess("🗑️ PRD deleted successfully");
      onBack();
    } catch (err) {
      console.error("Failed to delete PRD:", err);
      setError("⚠️ Failed to delete PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!workspaceId && (
        <p className="mb-4 text-sm text-red-500">
          Workspace context missing. Please return to the project list.
        </p>
      )}
      {/* Back Button */}
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 bg-gray-600 text-white rounded"
      >
        ⬅ Back to PRDs
      </button>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}
      <ContextUsedPanel entries={contextEntries} />

      {prd ? (
        <div>
          <h1 className="text-2xl font-bold mb-4">
            {prd.feature_name || "PRD Detail"}
          </h1>

          {/* PRD Content (Markdown) */}
          <div className="p-4 border rounded bg-gray-50 mb-6">
            <ReactMarkdown>{prd.content || ""}</ReactMarkdown>
          </div>

          {/* Refine Section */}
          <div className="mb-6">
            <textarea
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder="Enter refinement instructions..."
              className="w-full p-2 border rounded mb-2"
              rows={4}
              disabled={!canEdit}
            />
            <button
              onClick={handleRefine}
              disabled={loading || !canEdit}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              Refine PRD
            </button>
            {!canEdit && (
              <p className="mt-2 text-xs text-slate-500">
                Viewer access cannot refine PRDs.
              </p>
            )}
          </div>

          {/* Export Button */}
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              📤 Export PRD
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || !canEdit}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            >
              🗑 Delete PRD
            </button>
          </div>
        </div>
      ) : (
        !loading && <p className="text-gray-500">No PRD found.</p>
      )}
    </div>
  );
}
