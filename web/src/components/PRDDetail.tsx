import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getPrd, refinePrd, exportPrd, deletePrd } from "../api";

type PRDDetailProps = {
  projectId: string;
  prdId: string;
  onBack: () => void;
};

export default function PRDDetail({ projectId, prdId, onBack }: PRDDetailProps) {
  const [prd, setPrd] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch PRD when component mounts
  useEffect(() => {
    const fetchPrd = async () => {
      setLoading(true);
      try {
        const data = await getPrd(projectId, prdId);
        setPrd(data);
        setError(null);
      } catch (err) {
        console.error("Failed to load PRD:", err);
        setError("⚠️ Failed to load PRD");
      } finally {
        setLoading(false);
      }
    };

    fetchPrd();
  }, [projectId, prdId]);

  // Handle refinement
  const handleRefine = async () => {
    if (!refineText.trim()) return;
    setLoading(true);
    try {
      // ✅ Pass both projectId + prdId, return Markdown string
      const newContent = await refinePrd(projectId, prdId, refineText);

      // ✅ Update only the content field, keep rest of PRD intact
      setPrd((prev: any) => (prev ? { ...prev, content: newContent } : prev));

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
      await exportPrd(projectId, prdId);
      setError(null);
      setSuccess("📤 Export started");
    } catch (err) {
      console.error("Failed to export PRD:", err);
      setError("⚠️ Failed to export PRD");
      setSuccess(null);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("Delete this PRD? This action cannot be undone.");
    if (!confirmed) return;

    setLoading(true);
    try {
      await deletePrd(projectId, prdId);
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
            />
            <button
              onClick={handleRefine}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              Refine PRD
            </button>
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
              disabled={loading}
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
