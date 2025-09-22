import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getPrd, refinePrd, exportPrd } from "../api";

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
      await refinePrd(prdId, refineText);
      const updated = await getPrd(projectId, prdId);
      setPrd(updated);
      setRefineText("");
    } catch (err) {
      console.error("Failed to refine PRD:", err);
      setError("⚠️ Failed to refine PRD");
    } finally {
      setLoading(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      await exportPrd(prdId);
    } catch (err) {
      console.error("Failed to export PRD:", err);
      setError("⚠️ Failed to export PRD");
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

      {prd ? (
        <div>
          <h1 className="text-2xl font-bold mb-4">{prd.title || "PRD Detail"}</h1>

          {/* PRD Content */}
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
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            ⬇ Export PRD
          </button>
        </div>
      ) : (
        !loading && <p className="text-gray-500">No PRD found.</p>
      )}
    </div>
  );
}
