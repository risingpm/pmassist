import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getDashboardOverview, getProjects, type DashboardOverview } from "../api";
import {
  AI_COACH_OPEN_EVENT,
  DEMO_PROJECT_ID_KEY,
  DEMO_WORKSPACE_ID_KEY,
  ONBOARDING_COMPLETE_KEY,
  USER_ID_KEY,
  WORKSPACE_ID_KEY,
  WORKSPACE_NAME_KEY,
  WIDE_PAGE_CONTAINER,
} from "../constants";
import OnboardingModal from "../components/onboarding/OnboardingModal";
import { SECTION_LABEL, BODY_SUBTLE, PRIMARY_BUTTON, SECONDARY_BUTTON, GHOST_BUTTON } from "../styles/theme";

type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  goals: string;
};

export default function WorkspaceHome() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  const workspaceName = useMemo(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  }, []);
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [demoProjectId, setDemoProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DEMO_PROJECT_ID_KEY);
  });

  useEffect(() => {
    if (!routeWorkspaceId) return;
    setWorkspaceId(routeWorkspaceId);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, routeWorkspaceId);
    }
  }, [routeWorkspaceId]);

  useEffect(() => {
    if (!workspaceId || !userId) {
      setProjects([]);
      setProjectsLoading(false);
      if (!workspaceId || !userId) {
        setProjectsError("Select a workspace to load projects.");
      }
      return;
    }
    let cancelled = false;
    setProjectsLoading(true);
    setProjectsError(null);
    getProjects(workspaceId, userId)
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects || []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProjectsError(err.message || "Failed to load projects");
      })
      .finally(() => {
        if (cancelled) return;
        setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    setOverviewLoading(true);
    setOverviewError(null);
    getDashboardOverview(workspaceId, userId)
      .then((data) => setOverview(data))
      .catch((err: any) => setOverviewError(err.message || "Failed to load workspace overview"))
      .finally(() => setOverviewLoading(false));
  }, [workspaceId, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) return;
    const demoWorkspaceId = window.localStorage.getItem(DEMO_WORKSPACE_ID_KEY);
    const onboardingComplete = window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
    if (demoWorkspaceId && demoWorkspaceId === workspaceId && !onboardingComplete) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
    setDemoProjectId(window.localStorage.getItem(DEMO_PROJECT_ID_KEY));
  }, [workspaceId]);

  const activeProject = projects.length > 0 ? projects[0] : null;
  const hasProjects = projects.length > 0;
  const kanbanTotal = overview?.tasks.total ?? 0;
  const kanbanDone = overview?.tasks.done ?? 0;
  const kanbanPercent = kanbanTotal > 0 ? Math.round((kanbanDone / kanbanTotal) * 100) : 0;
  const roadmapTotal = overview?.roadmap.total_tasks ?? 0;
  const roadmapDone = overview?.roadmap.done_tasks ?? 0;
  const roadmapUpcoming = Math.max(roadmapTotal - roadmapDone, 0);

  const markOnboardingComplete = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    }
    setShowOnboarding(false);
  };

  const handleStartTour = () => {
    markOnboardingComplete();
    if (!workspaceId) return;
    const targetProjectId = demoProjectId || activeProject?.id;
    if (targetProjectId) {
      navigate(`/workspaces/${workspaceId}/projects/detail/${targetProjectId}`);
    } else {
      navigate(`/workspaces/${workspaceId}/projects`);
    }
  };

  const handleSkipTour = () => {
    markOnboardingComplete();
  };

  const handleNewProject = () => {
    if (!workspaceId) return;
    navigate(`/workspaces/${workspaceId}/projects`);
  };

  const handleTemplates = () => {
    if (!workspaceId) return;
    navigate(`/workspaces/${workspaceId}/templates`);
  };

  const handleAskCoach = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AI_COACH_OPEN_EVENT));
    }
  };

  const handleOpenRoadmap = () => {
    if (!workspaceId || !activeProject) return;
    navigate(`/workspaces/${workspaceId}/projects/detail/${activeProject.id}/roadmap`);
  };

  const navItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: true },
      { label: "Insights", path: `/workspaces/${workspaceId}/insights`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Knowledge", path: `/workspaces/${workspaceId}/knowledge`, active: false },
      { label: "Templates", path: `/workspaces/${workspaceId}/templates`, active: false },
    ];
  }, [workspaceId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8 md:py-12`}>
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={SECTION_LABEL}>Workspace overview</p>
            <h1 className="text-3xl font-semibold text-slate-900">{workspaceName} dashboard</h1>
            <p className={BODY_SUBTLE}>Track your active project, roadmap, and Kanban momentum at a glance.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleNewProject} className={PRIMARY_BUTTON}>
              New Project
            </button>
            <button type="button" onClick={handleAskCoach} className={SECONDARY_BUTTON}>
              Ask AI Coach
            </button>
            <button type="button" onClick={handleTemplates} className={GHOST_BUTTON}>
              Use Template
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

        {(projectsError || overviewError) && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {projectsError || overviewError}
          </div>
        )}

        {projectsLoading && (
          <div className="rounded-3xl border border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
            Loading your workspace…
          </div>
        )}

        {!projectsLoading && !hasProjects && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">Let&apos;s create your first project 🚀</h2>
            <p className="mt-2 text-sm text-slate-500">
              Use a template or start from scratch. Your AI Coach is ready to help you draft PRDs, roadmaps, and tasks.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={handleTemplates} className={PRIMARY_BUTTON}>
                Use a template
              </button>
              <button type="button" onClick={handleNewProject} className={SECONDARY_BUTTON}>
                Start from scratch
              </button>
            </div>
          </div>
        )}

        {hasProjects && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Active Project</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{activeProject?.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{activeProject?.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Goals</p>
              <p className="mt-1 text-sm text-slate-600">{activeProject?.goals}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!workspaceId || !activeProject) return;
                    navigate(`/workspaces/${workspaceId}/projects/detail/${activeProject.id}`);
                  }}
                  className={PRIMARY_BUTTON}
                >
                  Open project
                </button>
                <button
                  type="button"
                  onClick={handleOpenRoadmap}
                  className={SECONDARY_BUTTON}
                >
                  View roadmap
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Roadmap summary</p>
              {overviewLoading ? (
                <p className="mt-4 text-sm text-slate-500">Loading roadmap...</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Current phase:{" "}
                    <span className="font-semibold text-slate-900">{overview?.roadmap.current_phase || "MVP"}</span>
                  </p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">MVP focus</p>
                      <p className="text-lg font-semibold text-slate-900">{roadmapDone} items done</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Phase 2 queued</p>
                      <p className="text-lg font-semibold text-slate-900">{roadmapUpcoming} upcoming</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Kanban overview</p>
              {overviewLoading ? (
                <p className="mt-4 text-sm text-slate-500">Loading tasks...</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    {kanbanDone} of {kanbanTotal} tasks complete
                  </p>
                  <div className="mt-3 h-3 rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                      style={{ width: `${kanbanPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Keep dragging cards to Done to unlock insights faster.</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <OnboardingModal open={showOnboarding} onStart={handleStartTour} onSkip={handleSkipTour} />
    </div>
  );
}
