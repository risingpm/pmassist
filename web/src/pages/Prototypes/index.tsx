import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PrototypeCard from "../../components/PrototypeCard";
import { listBuilderPrototypes, type BuilderPrototypeRecord } from "../../api";
import { USER_ID_KEY, WORKSPACE_ID_KEY } from "../../constants";

export default function PrototypesPage() {
  const navigate = useNavigate();
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const workspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [routeWorkspaceId]);
  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) : null;
  const [prototypes, setPrototypes] = useState<BuilderPrototypeRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!workspaceId || !userId) return;
      try {
        const results = await listBuilderPrototypes(workspaceId, userId);
        setPrototypes(results);
      } catch (err: any) {
        setError(err.message || "Failed to load prototypes");
      }
    };
    run();
  }, [workspaceId, userId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          ⬅ Back
        </button>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Saved Prototypes</h1>
            <p className="text-sm text-slate-500">All builder outputs saved to this workspace.</p>
          </div>
          {workspaceId && (
            <button
              onClick={() => navigate(`/workspaces/${workspaceId}/builder`)}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Builder
            </button>
          )}
        </div>
        {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
        {prototypes.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500">No prototypes yet.</p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {prototypes.map((prototype) => (
              <PrototypeCard
                key={prototype.id}
                prototype={prototype}
                onSelect={() => workspaceId && navigate(`/workspaces/${workspaceId}/builder`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
