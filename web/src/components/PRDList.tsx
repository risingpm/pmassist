import React, { useEffect, useState } from "react";
import { getPrds, createPrd } from "../api";

type PRDListProps = {
  projectId: string;
  onSelectPrd: (id: string) => void;
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
        setPrds(data.prds || []); // backend should return { prds: [...] }
      })
      .catch((err) => {
        console.error("Failed to load PRDs:", err);
        setError("⚠️ Failed to load PRDs");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Generate new PRD
  const handleGenerate = async () => {
    setLoading(true);
    try {
      await createPrd(projectId);
      const refreshed = await getPrds(projectId);
      setPrds(refreshed.prds || []);
    } catch (err) {
      console.error("Failed to generate PRD:", err);
      setError("⚠️ Failed to generate PRD");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📑 Product Requirement Documents</h1>

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

      {/* Loading/Error */}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {/* PRD list */}
      {prds.length === 0 ? (
        <p className="text-gray-500">No PRDs yet. Click "Generate PRD" to create one.</p>
      ) : (
        <ul className="space-y-2">
          {prds.map((prd: any) => (
            <li
              key={prd.id}
              className="p-2 border rounded cursor-pointer hover:bg-gray-100"
              onClick={() => onSelectPrd(prd.id)}
            >
              <p className="font-medium">{prd.title || `PRD ${prd.id}`}</p>
              <p className="text-sm text-gray-500">
                Created: {new Date(prd.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
