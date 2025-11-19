import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import type { GitHubRepoRecord, GitHubWorkspaceContext, KnowledgeEntryRecord } from "../api";
import { fetchUserRepos, getGitHubContext, startGitHubAuth, syncGitHubRepo } from "../api";
import {
  AUTH_USER_KEY,
  USER_ID_KEY,
  WORKSPACE_ID_KEY,
  WORKSPACE_NAME_KEY,
} from "../constants";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function latestInsight(repo: GitHubRepoRecord | null): GitHubRepoRecord["insights"][number] | null {
  if (!repo || !repo.insights || repo.insights.length === 0) return null;
  return [...repo.insights].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}

function groupKnowledge(entries: KnowledgeEntryRecord[]) {
  return entries.reduce<Record<string, KnowledgeEntryRecord[]>>((acc, entry) => {
    const key = entry.entry_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});
}

type NormalizedPillar = {
  title: string;
  summary?: string;
  problem?: string;
  valueAdd?: string;
  nextSteps: string[];
  supportingAssets: string[];
  implementationNotes: string[];
  apiEndpoints: string[];
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item): item is string => Boolean(item));
  }
  const single = asString(value);
  return single ? [single] : [];
};

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const endpointToString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const method = asString(record["method"]) ?? asString(record["http_method"]) ?? asString(record["verb"]);
    const path =
      asString(record["path"]) ??
      asString(record["endpoint"]) ??
      asString(record["url"]) ??
      asString(record["route"]);
    const name = asString(record["name"]) ?? asString(record["title"]);
    const description = asString(record["description"]) ?? asString(record["summary"]) ?? asString(record["details"]);
    const primary = [method ? method.toUpperCase() : null, path || name].filter(Boolean).join(" ");
    if (primary && description) return `${primary} – ${description}`;
    if (primary) return primary;
    if (description) return description;
  }
  return undefined;
};

const asEndpointArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return dedupeStrings(
      value
        .map(endpointToString)
        .filter((item): item is string => Boolean(item))
    );
  }
  const single = endpointToString(value);
  return single ? [single] : [];
};

function normalizeStrategicPillar(pillar: unknown): NormalizedPillar | null {
  if (pillar == null) return null;
  if (typeof pillar === "string") {
    const text = pillar.trim();
    if (!text) return null;
    return {
      title: text,
      apiEndpoints: [],
      nextSteps: [],
      supportingAssets: [],
      implementationNotes: [],
    };
  }
  if (typeof pillar === "object" && !Array.isArray(pillar)) {
    const record = pillar as Record<string, unknown>;
    const title =
      asString(record["use_case"]) ??
      asString(record["title"]) ??
      asString(record["name"]) ??
      asString(record["problem"]) ??
      asString(record["summary"]) ??
      "Strategic Pillar";
    const nextSteps = dedupeStrings(asStringArray(record["next_steps"]));
    const supportingAssets = dedupeStrings(asStringArray(record["supporting_assets"]));
    const implementationNotes = dedupeStrings(asStringArray(record["implementation_notes"]));
    const apiEndpoints = asEndpointArray(
      record["api_endpoints"] ?? record["endpoints"] ?? record["key_endpoints"] ?? record["api_surface"] ?? record["apis"]
    );
    return {
      title,
      summary: asString(record["summary"]),
      problem: asString(record["problem"]),
      valueAdd: asString(record["value_add"]),
      nextSteps,
      supportingAssets,
      implementationNotes,
      apiEndpoints,
    };
  }
  const fallback = String(pillar).trim();
  if (!fallback) return null;
  return {
    title: fallback,
    apiEndpoints: [],
    nextSteps: [],
    supportingAssets: [],
    implementationNotes: [],
  };
}

export { normalizeStrategicPillar };

function collectStrategicPillars(
  repo: GitHubRepoRecord,
  insights: GitHubRepoRecord["insights"],
  knowledgeEntries: KnowledgeEntryRecord[]
): NormalizedPillar[] {
  const unique = new Map<string, NormalizedPillar>();

  const addPillar = (pillar: NormalizedPillar | null) => {
    if (!pillar) return;
    const key = [
      pillar.title.toLowerCase(),
      pillar.summary ?? "",
      pillar.problem ?? "",
      pillar.valueAdd ?? "",
      pillar.nextSteps.join("|"),
      pillar.supportingAssets.join("|"),
      pillar.implementationNotes.join("|"),
      pillar.apiEndpoints.join("|"),
    ].join("||");
    if (!unique.has(key)) {
      unique.set(key, pillar);
    }
  };

  const sorted = [...(insights ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  for (const insight of sorted) {
    const normalized = (insight?.strategic_pillars ?? [])
      .map(normalizeStrategicPillar)
      .filter((pillar): pillar is NormalizedPillar => pillar !== null);
    normalized.forEach(addPillar);
  }

  const repoEntries = knowledgeEntries.filter((entry) => entry.entry_type === "product_use_case");

  for (const entry of repoEntries) {
    const metadata =
      entry.metadata && typeof entry.metadata === "object"
        ? (entry.metadata as Record<string, unknown>)
        : {};

    const metadataRepo = asString(metadata["repo_full_name"]);
    const matchesRepo =
      (entry.repo_id && entry.repo_id === repo.id) ||
      (metadataRepo && metadataRepo.toLowerCase() === repo.repo_full_name.toLowerCase());

    if (!matchesRepo) continue;

    const pillar: NormalizedPillar = {
      title:
        asString(metadata["use_case"]) ??
        asString(metadata["title"]) ??
        asString(metadata["name"]) ??
        entry.title ??
        "Product Use Case",
      summary: asString(metadata["summary"]),
      problem: asString(metadata["problem"]),
      valueAdd: asString(metadata["value_add"]),
      nextSteps: dedupeStrings(asStringArray(metadata["next_steps"])),
      supportingAssets: dedupeStrings(asStringArray(metadata["supporting_assets"])),
      implementationNotes: dedupeStrings(asStringArray(metadata["implementation_notes"])),
      apiEndpoints: asEndpointArray(metadata["api_endpoints"]),
    };
    addPillar(pillar);
  }

  return Array.from(unique.values());
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [context, setContext] = useState<GitHubWorkspaceContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableRepos, setAvailableRepos] = useState<Array<Record<string, unknown>>>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasUser = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (!hasUser) {
      navigate("/signin", { replace: true });
      return;
    }
    const storedWorkspace = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    const storedName = window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
    const storedUser = window.sessionStorage.getItem(USER_ID_KEY);
    setWorkspaceId(storedWorkspace);
    setWorkspaceName(storedName);
    setUserId(storedUser);
  }, [navigate]);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    getGitHubContext(workspaceId)
      .then(setContext)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load integration context"))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    if (!context) return;
    const groups = groupKnowledge(context.knowledge_entries || []);
    if (groups.insight && groups.insight.length > 0) {
      setSuccess("Strategic insights available from your latest sync.");
    }
  }, [context]);

  useEffect(() => {
    if (!location.search) return;
    const params = new URLSearchParams(location.search);
    if (params.get("connected")) {
      setSuccess("GitHub account connected successfully.");
      params.delete("connected");
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (!success && !error) return;
    const timer = window.setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [success, error]);

  const handleConnect = async () => {
    if (!workspaceId || !userId) {
      setError("Missing workspace context");
      return;
    }
    try {
      const { authorize_url } = await startGitHubAuth(workspaceId, userId);
      window.location.href = authorize_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start GitHub OAuth");
    }
  };

  const handleLoadRepos = async () => {
    if (!workspaceId || !userId) {
      setError("Missing workspace context");
      return;
    }
    setLoadingRepos(true);
    try {
      const data = await fetchUserRepos(workspaceId, userId);
      setAvailableRepos(data.available_repos ?? []);
      const refreshed = await getGitHubContext(workspaceId);
      setContext(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch repositories");
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSyncRepo = async (repoFullName: string) => {
    if (!workspaceId || !userId) {
      setError("Missing workspace context");
      return;
    }
    setSyncingRepo(repoFullName);
    try {
      await syncGitHubRepo(workspaceId, userId, { repo_full_name: repoFullName, force: true });
      const refreshed = await getGitHubContext(workspaceId);
      setContext(refreshed);
      setSuccess(`Synced ${repoFullName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync repository");
    } finally {
      setSyncingRepo(null);
    }
  };

  const connectedRepos = useMemo(() => {
    if (!context) return [] as GitHubRepoRecord[];
    return context.connections.flatMap((connection) => connection.repos);
  }, [context]);

  const knowledgeGroups = useMemo(() => groupKnowledge(context?.knowledge_entries ?? []), [context]);
  const workspaceKnowledgeEntries = context?.knowledge_entries ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Integrations</h1>
            <p className="text-sm text-slate-500">Connect GitHub to unlock AI-powered repository insights.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              to="/dashboard"
              className="rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              ← Back to Dashboard
            </Link>
            {workspaceName && (
              <span className="rounded-full bg-slate-100 px-4 py-2 text-slate-600">Workspace: {workspaceName}</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {(success || error) && (
          <div
            className={`mb-6 rounded-2xl px-4 py-3 text-sm font-medium ${
              success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
            }`}
          >
            {success || error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">GitHub Integration</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Connect a GitHub repository to automatically sync repo metadata, documentation, commits, and code summaries. AI will
                translate this context into strategic pillars, a roadmap, and draft PRDs for your workspace.
              </p>
            </div>
            <button
              onClick={handleConnect}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
            >
              Connect GitHub
            </button>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Connected Repositories</h3>
              {loading ? (
                <p className="mt-3 text-sm text-slate-500">Loading integration details...</p>
              ) : connectedRepos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No repositories synced yet.</p>
              ) : (
                <ul className="mt-4 space-y-4">
              {connectedRepos.map((repo) => {
                const insight = latestInsight(repo);
                const normalizedPillars = collectStrategicPillars(
                  repo,
                  repo.insights,
                  workspaceKnowledgeEntries
                );
                const topics = (repo.metadata?.topics as string[] | undefined) ?? [];
                const repoDescription = asString(repo.metadata?.description);
                return (
                  <li key={repo.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                            <p className="text-base font-semibold text-slate-900">{repo.repo_full_name}</p>
                            <p className="text-xs text-slate-500">Last synced: {formatDate(repo.last_synced)}</p>
                          </div>
                          <button
                            onClick={() => handleSyncRepo(repo.repo_full_name)}
                            disabled={syncingRepo === repo.repo_full_name}
                            className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                          >
                            {syncingRepo === repo.repo_full_name ? "Syncing..." : "Sync Now"}
                          </button>
                        </div>
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          {repoDescription && <p>{repoDescription}</p>}
                          {topics.length > 0 && (
                            <p className="text-xs uppercase tracking-wide text-slate-400">
                              Topics: {topics.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            Context entries: {repo.contexts.length} · Insights generated: {repo.insights.length}
                          </p>
                          {normalizedPillars.length > 0 && (
                            <div className="rounded-2xl bg-slate-100 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Strategic Pillars</p>
                              <ul className="mt-2 list-disc space-y-2 pl-4 text-xs text-slate-600">
                                {normalizedPillars.map((pillar, index) => (
                                  <li key={`${insight?.id ?? repo.id}-pillar-${index}`}>
                                    <span className="font-medium text-slate-700">{pillar.title}</span>
                                    {pillar.summary && <p className="mt-1 text-xs text-slate-500">{pillar.summary}</p>}
                                    {!pillar.summary && pillar.valueAdd && (
                                      <p className="mt-1 text-xs text-slate-500">Value Add: {pillar.valueAdd}</p>
                                    )}
                                    {!pillar.summary && !pillar.valueAdd && pillar.problem && (
                                      <p className="mt-1 text-xs text-slate-500">Problem: {pillar.problem}</p>
                                    )}
                                    {pillar.apiEndpoints.length > 0 && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        API Endpoints: {pillar.apiEndpoints.slice(0, 2).join(", ")}
                                        {pillar.apiEndpoints.length > 2 ? "…" : ""}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Available Repositories</h3>
                <button
                  onClick={handleLoadRepos}
                  disabled={loadingRepos}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {loadingRepos ? "Loading..." : "Load from GitHub"}
                </button>
              </div>
              {availableRepos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Fetch repositories to sync a project. Make sure your GitHub OAuth scopes include repository access.
                </p>
              ) : (
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  {availableRepos.map((repo) => {
                    const fullName = (repo.full_name as string) ?? "";
                    const description = asString(repo.description);
                    return (
                      <li key={fullName} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-900">{fullName}</p>
                            {description && <p className="text-xs text-slate-500">{description}</p>}
                          </div>
                          <button
                            onClick={() => handleSyncRepo(fullName)}
                            disabled={syncingRepo === fullName}
                            className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                          >
                            {syncingRepo === fullName ? "Syncing..." : "Sync"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {connectedRepos.length > 0 && (
          <section className="mt-10 space-y-6">
            <h3 className="text-xl font-semibold text-slate-900">AI-Generated Insights</h3>
            {connectedRepos.map((repo) => {
              const insight = latestInsight(repo);
              const normalizedPillars = collectStrategicPillars(
                repo,
                repo.insights,
                workspaceKnowledgeEntries
              );
              const roadmap = insight?.roadmap as Record<string, unknown> | undefined;
              const prds = (insight?.prd_drafts as Array<Record<string, unknown>> | undefined) ?? [];
              return (
                <div key={`${repo.id}-insights`} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">{repo.repo_full_name}</p>
                      <p className="text-xs text-slate-500">Insights generated {formatDate(insight?.created_at)}</p>
                    </div>
                    <a
                      href={repo.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      View on GitHub ↗
                    </a>
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategic Pillars</p>
                      {normalizedPillars.length > 0 ? (
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          {normalizedPillars.map((pillar, index) => {
                            const listSections = [
                              { title: "API Endpoints", items: pillar.apiEndpoints },
                              { title: "Next Steps", items: pillar.nextSteps },
                              { title: "Supporting Assets", items: pillar.supportingAssets },
                              { title: "Implementation Notes", items: pillar.implementationNotes },
                            ];
                            return (
                              <div key={`${repo.id}-pillar-full-${index}`} className="rounded-xl bg-slate-100 p-3">
                                <p className="text-sm font-semibold text-slate-800">{pillar.title}</p>
                                {pillar.summary && <p className="mt-1 text-xs text-slate-500">{pillar.summary}</p>}
                                {pillar.problem && <p className="mt-1 text-xs text-slate-500">Problem: {pillar.problem}</p>}
                                {pillar.valueAdd && <p className="mt-1 text-xs text-slate-500">Value Add: {pillar.valueAdd}</p>}
                                {listSections.map(
                                  (section) =>
                                    section.items.length > 0 && (
                                      <div key={section.title} className="mt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {section.title}
                                        </p>
                                        <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                                          {section.items.map((item, itemIdx) => (
                                            <li key={`${repo.id}-pillar-${index}-${section.title}-${itemIdx}`}>{item}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">Sync the repository to generate pillars.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Roadmap</p>
                      {roadmap ? (
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          {["phase_1", "phase_2", "phase_3"].map((key) => {
                            const phase = roadmap[key] as Record<string, unknown> | undefined;
                            if (!phase) return null;
                            const initiatives = asStringArray(phase.key_initiatives);
                            const phaseName =
                              asString(phase.name) ?? key.replace("_", " ").toUpperCase();
                            const phaseGoal = asString(phase.goal);
                            return (
                              <div key={`${repo.id}-${key}`} className="rounded-xl bg-slate-100 p-3">
                                <p className="text-sm font-semibold text-slate-800">{phaseName}</p>
                                {phaseGoal && <p className="text-xs text-slate-500">Goal: {phaseGoal}</p>}
                                {initiatives.length > 0 && (
                                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                                    {initiatives.map((item, index) => (
                                      <li key={`${repo.id}-${key}-${index}`}>{item}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">No roadmap yet. Trigger a sync to generate one.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PRD Drafts</p>
                      {prds.length > 0 ? (
                        <div className="mt-3 space-y-3 text-sm text-slate-600">
                          {prds.slice(0, 3).map((prd, index) => {
                            const draftName = asString(prd.name) ?? `Draft ${index + 1}`;
                            const draftProblem = asString(prd.problem);
                            const draftSolution = asString(prd.solution_outline);
                            return (
                              <div key={`${repo.id}-prd-${index}`} className="rounded-xl bg-slate-100 p-3">
                                <p className="text-sm font-semibold text-slate-800">{draftName}</p>
                                {draftProblem && (
                                  <p className="text-xs text-slate-500">Problem: {draftProblem}</p>
                                )}
                                {draftSolution && (
                                  <p className="text-xs text-slate-500">Solution: {draftSolution}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">AI PRD drafts will appear after the next sync.</p>
                      )}
                    </div>
                  </div>

                  {repo.contexts.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context Snapshots</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {repo.contexts.slice(0, 4).map((ctx) => (
                          <div key={ctx.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ctx.file_path}</p>
                            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{ctx.content_summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {Object.keys(knowledgeGroups).length > 0 && (
          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900">Workspace Knowledge Entries</h3>
            <p className="mt-2 text-sm text-slate-500">
              These entries are added to your knowledge base for retrieval when generating PRDs, roadmaps, or other AI outputs.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {Object.entries(knowledgeGroups).map(([type, entries]) => (
                <div key={type} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{type.replace("_", " ")}</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    {entries.slice(0, 4).map((entry) => (
                      <li key={entry.id} className="rounded-xl bg-slate-100 p-3">
                        <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(entry.created_at)}</p>
                        <p className="mt-2 text-xs text-slate-600">{entry.content}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
