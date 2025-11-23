import React, { useEffect, useState } from "react";
import { getPrds, createPrd, deletePrd, type ProjectRole, type KnowledgeBaseContextItem, type PRDRecord } from "../api";
import ContextUsedPanel from "./ContextUsedPanel";

type PRDListProps = {
  projectId: string;
  workspaceId: string | null;
  projectRole: ProjectRole;
  onSelectPrd: (projectId: string, prdId: string) => void;
  onBack: () => void;
};

export default function PRDList({
  projectId,
  workspaceId,
  projectRole,
  onSelectPrd,
  onBack,
}: PRDListProps) {
  const [prds, setPrds] = useState<PRDRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);

  // new state for form
  const [featureName, setFeatureName] = useState("");
  const [prompt, setPrompt] = useState("");
  const canEdit = projectRole === "owner" || projectRole === "contributor";

  // Fetch PRDs on mount
  useEffect(() => {
    if (!workspaceId) {
      setError("Workspace not available. Return to projects and choose a workspace.");
      return;
    }
    setLoading(true);
    getPrds(projectId, workspaceId)
      .then((data) => {
        setPrds(data || []);
        if (data && data.length > 0) {
          setContextEntries(data[0].context_entries ?? []);
        } else {
          setContextEntries([]);
        }
      })
      .catch((err) => {
        console.error("Failed to load PRDs:", err);
        setError("❌ Failed to load PRDs");
      })
      .finally(() => setLoading(false));
  }, [projectId, workspaceId]);

  // Handle Generate via form
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    setLoading(true);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      const created = await createPrd(projectId, workspaceId, {
        feature_name: featureName,
        prompt: prompt,
      });
      const refreshed = await getPrds(projectId, workspaceId);
      setPrds(refreshed || []);
      setContextEntries(created.context_entries ?? []);
      setFeatureName("");
      setPrompt("");
      setError(null);
      setSuccess("✅ PRD generated successfully");
    } catch (err) {
      console.error("Failed to generate PRD:", err);
      setError("❌ Failed to generate PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (prdId: string) => {
    if (!canEdit) {
      setError("You have read-only access to this project.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to delete this PRD?");
    if (!confirmed) return;

    setLoading(true);
    try {
      if (!workspaceId) throw new Error("Missing workspace context");
      await deletePrd(projectId, prdId, workspaceId);
      const refreshed = await getPrds(projectId, workspaceId);
      setPrds(refreshed || []);
      if (refreshed && refreshed.length > 0) {
        setContextEntries(refreshed[0].context_entries ?? []);
      } else {
        setContextEntries([]);
      }
      setError(null);
      setSuccess("🗑️ PRD deleted successfully");
    } catch (err) {
      console.error("Failed to delete PRD:", err);
      setError("❌ Failed to delete PRD");
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!workspaceId && (
        <p className="mb-4 text-sm text-red-500">
          Workspace context missing. Please go back and select a workspace.
        </p>
      )}
      <h1 className="text-2xl font-bold mb-6">📄 Product Requirements Documents</h1>

      {/* Back Button */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          ⬅ Back
        </button>
      </div>

      {/* PRD Generation Form */}
      <form onSubmit={handleGenerate} className="mb-6 space-y-4">
        <div>
          <label className="block font-medium">Feature Name</label>
          <input
            type="text"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            required
            className="w-full border rounded p-2"
            placeholder="Enter feature name"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block font-medium">Prompt / Description</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            className="w-full border rounded p-2"
            rows={4}
            placeholder="Describe the feature..."
            disabled={!canEdit}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !canEdit}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate PRD"}
        </button>
        {!canEdit && (
          <p className="text-xs text-slate-500">
            Viewer access cannot create or refine PRDs.
          </p>
        )}
      </form>

      {/* Loading/Error States */}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}

      <ContextUsedPanel entries={contextEntries} />

      {/* PRDs Table */}
      {prds.length === 0 ? (
        <p className="text-gray-500">
          No PRDs yet. Fill in the form above to generate one.
        </p>
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
            {prds.map((prd) => (
              <tr key={prd.id} className="hover:bg-gray-50">
                <td className="p-2 border font-medium">
                  {prd.feature_name || `PRD ${prd.id}`}
                </td>
                <td className="p-2 border text-sm text-gray-600">
                  {prd.description || "-"}
                </td>
                <td className="p-2 border text-sm">
                  {new Date(prd.created_at).toLocaleString()}
                </td>
                <td className="p-2 border space-x-2">
                  <button
                    onClick={() => onSelectPrd(projectId, prd.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded"
                  >
                    View
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(prd.id)}
                      disabled={loading}
                      className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
