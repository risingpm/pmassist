import { useEffect, useState } from "react";
import type { WorkspaceAgent } from "../api";
import { getAgentTemplates, cloneWorkspaceAgent } from "../api";
import { SURFACE_CARD, SURFACE_MUTED } from "../styles/theme";

type AgentTemplateGalleryProps = {
  workspaceId: string | null;
  onCloned?: (agent: WorkspaceAgent) => void;
};

export default function AgentTemplateGallery({ workspaceId, onCloned }: AgentTemplateGalleryProps) {
  const [templates, setTemplates] = useState<WorkspaceAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAgentTemplates()
      .then(setTemplates)
      .catch((err) => setError(err.message || "Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  const handleClone = async (agentId: string) => {
    if (!workspaceId) return;
    try {
      const clone = await cloneWorkspaceAgent(workspaceId, agentId);
      onCloned?.(clone);
    } catch (err: any) {
      setError(err.message || "Failed to clone agent");
    }
  };

  return (
    <div className={`${SURFACE_CARD} space-y-3 p-5`}>
      <header>
        <p className="text-sm font-semibold text-slate-900">Agent template gallery</p>
        <p className="text-xs text-slate-500">Clone a public agent to jumpstart your own copilots.</p>
        {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
      </header>
      {loading ? (
        <p className="text-sm text-slate-500">Loading templates…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <div key={template.id} className={`${SURFACE_MUTED} flex flex-col justify-between`}>
              <div>
                <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                <p className="text-xs text-slate-500">{template.description}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{template.model_name}</span>
                <span>•</span>
                <span>{template.modules.join(", ") || "No tools"}</span>
              </div>
              <button
                type="button"
                onClick={() => handleClone(template.id)}
                disabled={!workspaceId}
                className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                Clone to workspace →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
