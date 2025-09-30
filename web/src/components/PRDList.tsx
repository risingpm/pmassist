import React, { useEffect, useState } from "react";
import { getPrds, createPrd } from "../api";

type PRDListProps = {
  projectId: string;
  onSelectPrd: (projectId: string, prdId: string) => void; // ✅ updated to pass both projectId + prdId
  onBack: () => void;
};

export default function PRDList({ projectId, onSelectPrd, onBack }: PRDListProps) {
  const [prds, setPrds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch PRDs on mount
  useEffect(() => {
    setLoading(true);
    getPrds(projectId)
      .then((data) => {
        console.log("PRDs response:", data);
        setPrds(data || []);
      })
      .catch((err) => {
        console.error("Failed to load PRDs:", err);
        setError("⚠️ Failed to load PRDs");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Generate a new PRD
  const handleGenerate = async () => {
    setLoading(true);
    try {
      await createPrd(projectId);
      const refreshed = await getPrds(projectId);
      setPrds(refreshed || []);
    } catch (err) {
      console.error("Failed to generate PRD:", err);
      setError("⚠️ Failed to generate PRD");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📄 Product Requirements Documents</h1>

      {/* Back + Generate buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          ⬅ Back
        </button>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Generating..." : "➕ Generate PRD"}
        </button>
      </div>

      {/* Loading/Error states */}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {/* PRDs Table */}
      {prds.length === 0 ? (
        <p className="text-gray-500">No PRDs yet. Click "Generate PRD" to create one.</p>
      ) : (
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Feature Name</th>
              <th className="p-2 border">Description</th>
              <th className="p-2 border">Created At</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {prds.map((prd: any) => (
              <tr key={prd.id} className="hover:bg-gray-50">
                <td className="p-2 border font-medium">{prd.feature_name || `PRD ${prd.id}`}</td>
                <td className="p-2 border text-sm text-gray-600">{prd.description || "-"}</td>
                <td className="p-2 border text-sm">{new Date(prd.created_at).toLocaleString()}</td>
                <td className="p-2 border">
                  <button
                    onClick={() => onSelectPrd(projectId, prd.id)} // ✅ pass both projectId + prdId
                    className="px-3 py-1 bg-blue-600 text-white rounded"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
