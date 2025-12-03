import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PrototypeCard from "../../components/PrototypeCard";
import { listBuilderPrototypes, type BuilderPrototypeRecord } from "../../api";
import { USER_ID_KEY, WORKSPACE_ID_KEY, WIDE_PAGE_CONTAINER } from "../../constants";
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, BODY_SUBTLE } from "../../styles/theme";

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

  const navItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Builder", path: `/workspaces/${workspaceId}/builder`, active: false },
      { label: "Prototypes", path: `/workspaces/${workspaceId}/prototypes`, active: true },
    ];
  }, [workspaceId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8`}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={SECTION_LABEL}>Workspace prototypes</p>
            <h1 className="text-3xl font-semibold text-slate-900">Saved Builder outputs</h1>
            <p className={BODY_SUBTLE}>All generative prototypes created under this workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(workspaceId ? `/workspaces/${workspaceId}/builder` : "/builder")}
              className={PRIMARY_BUTTON}
            >
              Open Builder
            </button>
            <button type="button" onClick={() => navigate(-1)} className={SECONDARY_BUTTON}>
              Back
            </button>
          </div>
        </header>

        {navItems.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className={`rounded-full px-4 py-2 ${
                  item.active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-rose-500">{error}</p>}
        {prototypes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
            No prototypes yet. Launch the Builder to create one.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
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
