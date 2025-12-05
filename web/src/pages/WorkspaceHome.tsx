import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getDashboardOverview,
  getProjects,
  getWorkspaceOnboardingStatus,
  updateWorkspaceOnboardingStatus,
  type DashboardOverview,
  type WorkspaceOnboardingStatus,
  type WorkspaceOnboardingStep,
} from "../api";
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

type StepId = WorkspaceOnboardingStep["id"];

type StepDetail = {
  id: StepId;
  label: string;
  description: string;
  actionLabel: string;
  pill: string;
};

const STEP_SEQUENCE: StepId[] = ["complete_profile", "create_project", "add_team_members", "generate_prd"];

const STEP_DETAILS: Record<StepId, StepDetail> = {
  complete_profile: {
    id: "complete_profile",
    label: "Complete your profile setup",
    description: "Update your workspace details and personalize your profile so collaborators know who you are.",
    actionLabel: "Open settings",
    pill: "Step 1",
  },
  create_project: {
    id: "create_project",
    label: "Create Your First Project",
    description: "Kick off a project so our AI copilots can draft PRDs, roadmap phases, tasks, and more.",
    actionLabel: "Create project",
    pill: "Step 2",
  },
  add_team_members: {
    id: "add_team_members",
    label: "Add team members",
    description: "Invite teammates so they can review docs, leave feedback, and log decisions in one place.",
    actionLabel: "Invite teammates",
    pill: "Step 3",
  },
  generate_prd: {
    id: "generate_prd",
    label: "Generate your first PRD",
    description: "Use AI to turn context into a baseline PRD draft, then iterate with your workspace knowledge.",
    actionLabel: "Draft PRD",
    pill: "Step 4",
  },
};

const QUICK_ACTIONS: Array<{ key: "project" | "knowledge" | "agents" | "templates"; title: string; subtitle: string }> = [
  { key: "project", title: "Create Your First Project", subtitle: "Kickstart roadmap planning quickly." },
  { key: "knowledge", title: "Build Your Knowledge Base", subtitle: "Upload context so AI stays grounded." },
  { key: "agents", title: "Customize Your AI Agent", subtitle: "Tailor copilots to your workflow." },
  { key: "templates", title: "Explore Templates", subtitle: "Jump in with ready-made blueprints." },
];

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
  const [onboardingStatus, setOnboardingStatus] = useState<WorkspaceOnboardingStatus | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

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
    if (!workspaceId || !userId) return;
    let cancelled = false;
    setOnboardingLoading(true);
    setOnboardingError(null);
    getWorkspaceOnboardingStatus(workspaceId, userId)
      .then((data) => {
        if (cancelled) return;
        setOnboardingStatus(data);
        if (data.next_step_id) {
          const idx = STEP_SEQUENCE.indexOf(data.next_step_id);
          setTipIndex(idx >= 0 ? idx : 0);
        } else {
          setTipIndex(0);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setOnboardingError(err.message || "Failed to load onboarding status");
      })
      .finally(() => {
        if (cancelled) return;
        setOnboardingLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const acknowledgeOnboarding = async () => {
    if (!workspaceId || !userId) return;
    try {
      const updated = await updateWorkspaceOnboardingStatus(workspaceId, { welcome_acknowledged: true }, userId);
      setOnboardingStatus(updated);
    } catch (err) {
      console.warn("Failed to update onboarding status", err);
    }
  };

  const markOnboardingComplete = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    }
    setShowOnboarding(false);
  };

  const handleStartTour = async () => {
    markOnboardingComplete();
    await acknowledgeOnboarding();
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

  const handleStepAction = (stepId: StepId) => {
    if (!workspaceId) return;
    switch (stepId) {
      case "complete_profile":
        navigate(`/workspaces/${workspaceId}/settings`);
        break;
      case "create_project":
        handleNewProject();
        break;
      case "add_team_members":
        navigate(`/workspaces/${workspaceId}/settings`);
        break;
      case "generate_prd":
        if (activeProject) {
          navigate(`/workspaces/${workspaceId}/projects/detail/${activeProject.id}`);
        } else {
          handleNewProject();
        }
        break;
      default:
        break;
    }
  };

  const handleQuickAction = (key: (typeof QUICK_ACTIONS)[number]["key"]) => {
    if (!workspaceId) return;
    switch (key) {
      case "project":
        handleNewProject();
        break;
      case "knowledge":
        navigate(`/workspaces/${workspaceId}/knowledge`);
        break;
      case "agents":
        navigate(`/workspaces/${workspaceId}/agents`);
        break;
      case "templates":
        handleTemplates();
        break;
      default:
        break;
    }
  };

  const renderGettingStartedDashboard = () => {
    const status = onboardingStatus;
    const steps = STEP_SEQUENCE.map((id) => {
      const completed = status?.steps.find((step) => step.id === id)?.completed ?? false;
      return { ...STEP_DETAILS[id], completed };
    });
    const activeTipIndex = Math.min(tipIndex, steps.length - 1);
    const activeTip = steps[activeTipIndex];
    const totalSteps = status?.total_steps ?? steps.length;
    const completedSteps = status?.completed_steps ?? steps.filter((step) => step.completed).length;
    const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
    const greetingName = status?.user_name || workspaceName;

    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 p-8 text-white shadow-xl">
            <div className="relative z-10">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/80">
                Welcome to {workspaceName}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Hey {greetingName || "there"}, let&apos;s get you started! 👋
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/80">
                We&apos;re excited to help you supercharge your product management workflow. Take a quick tour to get up
                and running.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <span className="h-1.5 w-8 rounded-full bg-white" />
                <span className="h-1.5 w-3 rounded-full bg-white/60" />
                <span className="h-1.5 w-3 rounded-full bg-white/40" />
              </div>
            </div>
        </div>

        {(projectsError || overviewError || onboardingError) && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {projectsError || overviewError || onboardingError}
          </div>
        )}

        {onboardingLoading && (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Loading your personalized tips…
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr),minmax(320px,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">
                Step {activeTipIndex + 1} of {steps.length}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{activeTip.label}</h2>
              <p className="mt-2 text-sm text-slate-600">{activeTip.description}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStepAction(activeTip.id)}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                >
                  {activeTip.actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setTipIndex((activeTipIndex + 1) % steps.length)}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Next Tip
                </button>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {steps.map((step, index) => (
                  <button
                    type="button"
                    key={step.id}
                    onClick={() => setTipIndex(index)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      index === activeTipIndex ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{step.pill}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{step.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {step.completed ? "Completed" : "Tap to learn more"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => handleQuickAction(action.key)}
                  className="rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{action.subtitle}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Getting Started</p>
              <ul className="mt-4 space-y-3">
                {steps.map((step) => (
                  <li key={step.id} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        step.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {step.completed ? "✓" : "•"}
                    </span>
                    <span className={step.completed ? "text-slate-500 line-through" : "text-slate-700"}>{step.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span>
                  {completedSteps} of {totalSteps} completed
                </span>
              </div>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Need help?</p>
              <p className="mt-2 text-sm text-slate-500">
                Our AI Coach is here to guide you through any questions about projects, PRDs, or templates.
              </p>
              <button
                type="button"
                onClick={handleAskCoach}
                className="mt-4 w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Talk to AI Coach
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8 md:py-12`}>
        {renderGettingStartedDashboard()}
      </div>
      <OnboardingModal open={showOnboarding} onStart={handleStartTour} onSkip={handleSkipTour} />
    </div>
  );
}
