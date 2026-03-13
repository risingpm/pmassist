import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getDashboardOverview,
  getProjects,
  getWorkspaceOnboardingStatus,
  updateWorkspaceOnboardingStatus,
  createProject,
  updateProject,
  askWorkspaceQuestion,
  createWorkspaceMemory,
  listWorkspaceMemory,
  type DashboardOverview,
  type WorkspaceMemory,
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
import useAgentName from "../hooks/useAgentName";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../styles/theme";

const STEP_SEQUENCE: WorkspaceOnboardingStep["id"][] = [
  "create_project",
  "set_goals",
  "generate_roadmap",
  "write_prd",
  "build_agent",
];

const STEP_DETAILS: Record<WorkspaceOnboardingStep["id"], { label: string; description: string; actionLabel: string; pill: string }> = {
  create_project: {
    label: "Create Your First Project",
    description: "Kick off a project so your AI partner has a canvas for goals, roadmaps, and docs.",
    actionLabel: "Create project",
    pill: "Step 1",
  },
  set_goals: {
    label: "Set Your Goals",
    description: "Capture 2-3 outcomes or ask AI to suggest measurable objectives.",
    actionLabel: "Save goals",
    pill: "Step 2",
  },
  generate_roadmap: {
    label: "Generate Your Roadmap",
    description: "Translate those goals into a phased plan in seconds.",
    actionLabel: "Generate roadmap",
    pill: "Step 3",
  },
  write_prd: {
    label: "Document Your First PRD",
    description: "Let AI draft the first version of your spec so you can iterate instead of start blank.",
    actionLabel: "Create PRD",
    pill: "Step 4",
  },
  build_agent: {
    label: "Build Your AI Agent",
    description: "Configure the teammate that will keep projects on track after onboarding.",
    actionLabel: "Open agent module",
    pill: "Step 5",
  },
};

const PROJECT_FOCUS_OPTIONS = ["Product", "Feature", "Experiment"];
const CONFETTI_PIECES = [
  { left: "6%", top: "10%", color: "bg-rose-400", delay: 0 },
  { left: "15%", top: "40%", color: "bg-amber-300", delay: 0.2 },
  { left: "30%", top: "25%", color: "bg-sky-400", delay: 0.35 },
  { left: "45%", top: "10%", color: "bg-emerald-400", delay: 0.1 },
  { left: "60%", top: "30%", color: "bg-indigo-400", delay: 0.4 },
  { left: "75%", top: "15%", color: "bg-pink-400", delay: 0.15 },
  { left: "85%", top: "35%", color: "bg-lime-400", delay: 0.3 },
  { left: "20%", top: "60%", color: "bg-cyan-400", delay: 0.25 },
];
const PROJECT_IDEA_TEMPLATES = [
  "Launch an AI assistant that writes PRDs for our analytics upgrades.",
  "Create a customer onboarding journey with proactive milestone nudges.",
  "Design a roadmap to expand into the enterprise chat market.",
  "Prototype a co-pilot for PMs that summarizes weekly metrics.",
];

type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  goals: string;
  website_url?: string | null;
};

type StepId = WorkspaceOnboardingStep["id"];

export default function WorkspaceHome() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const agentName = useAgentName();
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
  const [, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<StepId>("create_project");
  const [stepSubmitting, setStepSubmitting] = useState(false);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [stepErrorMessage, setStepErrorMessage] = useState<string | null>(null);
  const [goalSuggestionLoading, setGoalSuggestionLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [workspaceUpdates, setWorkspaceUpdates] = useState<WorkspaceMemory[]>([]);
  const [workspaceUpdatesLoading, setWorkspaceUpdatesLoading] = useState(false);
  const [workspaceUpdatesError, setWorkspaceUpdatesError] = useState<string | null>(null);
  const [newWorkspaceUpdate, setNewWorkspaceUpdate] = useState("");
  const [postingWorkspaceUpdate, setPostingWorkspaceUpdate] = useState(false);

  const [projectForm, setProjectForm] = useState({
    title: "",
    description: "",
    focus: PROJECT_FOCUS_OPTIONS[0],
    goal: "",
    website_url: "",
  });
  const [quickProjectIdea, setQuickProjectIdea] = useState("");
  const [quickProjectMessage, setQuickProjectMessage] = useState<string | null>(null);
  const [quickProjectError, setQuickProjectError] = useState<string | null>(null);
  const [quickProjectLoading, setQuickProjectLoading] = useState(false);
  const [goalForm, setGoalForm] = useState({ projectId: "", goals: "" });
  const [roadmapForm, setRoadmapForm] = useState({ projectId: "", timeline: "3 months", phases: "MVP, Beta, Launch" });
  const [prdProjectId, setPrdProjectId] = useState("");

  useEffect(() => {
    if (!routeWorkspaceId) return;
    setWorkspaceId(routeWorkspaceId);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, routeWorkspaceId);
    }
  }, [routeWorkspaceId]);

  const loadProjects = useCallback(async () => {
    if (!workspaceId || !userId) {
      setProjects([]);
      if (!workspaceId || !userId) {
        setProjectsError("Select a workspace to load projects.");
      }
      return;
    }
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const data = await getProjects(workspaceId, userId);
      setProjects(data.projects || []);
    } catch (err: any) {
      setProjectsError(err.message || "Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadOverview = useCallback(async () => {
    if (!workspaceId || !userId) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await getDashboardOverview(workspaceId, userId);
      setOverview(data);
    } catch (err: any) {
      setOverviewError(err.message || "Failed to load workspace overview");
    } finally {
      setOverviewLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadWorkspaceUpdates = useCallback(async () => {
    if (!workspaceId) return;
    setWorkspaceUpdatesLoading(true);
    setWorkspaceUpdatesError(null);
    try {
      const data = await listWorkspaceMemory(workspaceId, { limit: 50 });
      const updatesOnly = data
        .filter((item) => item.source === "workspace_update" || item.tags?.includes("workspace_update"))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setWorkspaceUpdates(updatesOnly);
    } catch (err: any) {
      setWorkspaceUpdatesError(err.message || "Failed to load workspace updates");
    } finally {
      setWorkspaceUpdatesLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadWorkspaceUpdates();
  }, [loadWorkspaceUpdates]);

  const loadOnboardingStatus = useCallback(async () => {
    if (!workspaceId || !userId) return;
    setOnboardingLoading(true);
    setOnboardingError(null);
    try {
      const data = await getWorkspaceOnboardingStatus(workspaceId, userId);
      setOnboardingStatus(data);
      const next = data.next_step_id || STEP_SEQUENCE.find((entry) => !data.steps.find((step) => step.id === entry)?.completed);
      if (next) {
        setSelectedStep(next);
      }
    } catch (err: any) {
      setOnboardingError(err.message || "Failed to load onboarding status");
    } finally {
      setOnboardingLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    loadOnboardingStatus();
  }, [loadOnboardingStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) return;
    const demoWorkspaceId = window.localStorage.getItem(DEMO_WORKSPACE_ID_KEY);
    const onboardingComplete = window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
    setShowOnboarding(Boolean(demoWorkspaceId && demoWorkspaceId === workspaceId && !onboardingComplete));
    setDemoProjectId(window.localStorage.getItem(DEMO_PROJECT_ID_KEY));
  }, [workspaceId]);

  useEffect(() => {
    if (projects.length === 0) return;
    const defaultProjectId = projects[0]?.id || "";
    setGoalForm((prev) => ({ ...prev, projectId: prev.projectId || defaultProjectId, goals: prev.goals || projects[0]?.goals || "" }));
    setRoadmapForm((prev) => ({ ...prev, projectId: prev.projectId || defaultProjectId }));
    setPrdProjectId((prev) => prev || defaultProjectId);
  }, [projects]);

  const stepsData = useMemo(() => {
    return STEP_SEQUENCE.map((id) => {
      const match = onboardingStatus?.steps.find((step) => step.id === id);
      return match || { id, completed: false, completed_at: null };
    });
  }, [onboardingStatus]);

  const isOnboardingComplete = stepsData.length > 0 && stepsData.every((step) => step.completed);

  useEffect(() => {
    setStepMessage(null);
    setStepErrorMessage(null);
  }, [selectedStep]);

  useEffect(() => {
    setShowCelebration(isOnboardingComplete);
  }, [isOnboardingComplete]);

  const progressPercent = onboardingStatus && onboardingStatus.total_steps > 0
    ? Math.round((onboardingStatus.completed_steps / onboardingStatus.total_steps) * 100)
    : Math.round((stepsData.filter((step) => step.completed).length / stepsData.length) * 100);
  const visibleWorkspaceUpdates = useMemo(() => workspaceUpdates.slice(0, 4), [workspaceUpdates]);

  const partnerName = onboardingStatus?.partner_name?.trim() || agentName;
  const partnerFocus = onboardingStatus?.partner_focus || [];
  const greetingName = workspaceName.split(" ")[0] || "there";
  const activeProject = projects[0] || null;
  const latestPrd = overview?.prds?.[0] || null;
  const prdCount = overview?.prds?.length ?? 0;

  const openProjectSection = (tab?: string) => {
    if (!workspaceId) return;
    if (activeProject?.id) {
      const suffix = tab ? `/${tab}` : "";
      navigate(`/workspaces/${workspaceId}/projects/detail/${activeProject.id}${suffix}`);
      return;
    }
    navigate(`/workspaces/${workspaceId}/projects`);
  };

  const acknowledgeOnboarding = useCallback(async () => {
    if (!workspaceId || !userId) return;
    try {
      const updated = await updateWorkspaceOnboardingStatus(workspaceId, { welcome_acknowledged: true }, userId);
      setOnboardingStatus(updated);
    } catch (err) {
      console.warn("Failed to acknowledge onboarding", err);
    }
  }, [workspaceId, userId]);

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

  const handleAskCoach = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AI_COACH_OPEN_EVENT));
    }
  };

  const handleWorkspaceUpdateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId) {
      setWorkspaceUpdatesError("Workspace context missing.");
      return;
    }
    const content = newWorkspaceUpdate.trim();
    if (!content) {
      setWorkspaceUpdatesError("Share a short update before posting.");
      return;
    }
    setPostingWorkspaceUpdate(true);
    try {
      const created = await createWorkspaceMemory(workspaceId, {
        content,
        source: "workspace_update",
        tags: ["workspace_update"],
      });
      setWorkspaceUpdates((prev) =>
        [created, ...prev].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
      setNewWorkspaceUpdate("");
      setWorkspaceUpdatesError(null);
    } catch (err: any) {
      setWorkspaceUpdatesError(err.message || "Failed to post update.");
    } finally {
      setPostingWorkspaceUpdate(false);
    }
  };

  const completeStep = useCallback(
    async (stepId: StepId) => {
      if (!workspaceId || !userId) return;
      try {
        const updated = await updateWorkspaceOnboardingStatus(
          workspaceId,
          { complete_step_id: stepId },
          userId
        );
        setOnboardingStatus(updated);
        if (updated.next_step_id) {
          setSelectedStep(updated.next_step_id);
        } else {
          setStepMessage("All steps complete — your workspace is ready! 🎉");
          setShowCelebration(true);
        }
      } catch (err) {
        console.error("Failed to update onboarding step", err);
      }
    },
    [workspaceId, userId]
  );

  const handleQuickProjectCreate = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    if (!workspaceId) {
      setQuickProjectError("Select or create a workspace first.");
      return;
    }
    const idea = quickProjectIdea.trim();
    if (!idea) {
      setQuickProjectError("Describe what you want to build.");
      return;
    }
    const firstSentence = idea.split(/[\n.!?]/).find((part) => part.trim().length > 0)?.trim() ?? "Untitled initiative";
    const title = firstSentence.length > 70 ? `${firstSentence.slice(0, 67)}…` : firstSentence;
    setQuickProjectLoading(true);
    setQuickProjectError(null);
    setQuickProjectMessage(null);
    try {
      await createProject({
        title,
        description: idea,
        goals: "AI-generated kickoff brief",
        workspace_id: workspaceId,
        target_personas: null,
        north_star_metric: null,
        website_url: null,
      });
      setQuickProjectIdea("");
      setQuickProjectMessage("Project created — opening your hub.");
      setTimeout(() => setQuickProjectMessage(null), 5000);
      await loadProjects();
      if (!isOnboardingComplete) {
        await completeStep("create_project");
      }
    } catch (err: any) {
      setQuickProjectError(err.message || "Failed to create project.");
    } finally {
      setQuickProjectLoading(false);
    }
  };

  const handleProjectSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId) {
      setStepErrorMessage("Workspace context missing.");
      return;
    }
    if (!projectForm.title.trim()) {
      setStepErrorMessage("Give your project a name.");
      return;
    }
    setStepSubmitting(true);
    setStepMessage(null);
    setStepErrorMessage(null);
    try {
      await createProject({
        title: projectForm.title.trim(),
        description: projectForm.description.trim() || `New ${projectForm.focus} initiative`,
        goals: projectForm.goal.trim() || "Align team on outcomes",
        workspace_id: workspaceId,
        target_personas: null,
        north_star_metric: null,
        website_url: projectForm.website_url.trim() || null,
      });
      setProjectForm({ title: "", description: "", focus: PROJECT_FOCUS_OPTIONS[0], goal: "", website_url: "" });
      setStepMessage("Project created successfully.");
      await loadProjects();
      await completeStep("create_project");
    } catch (err: any) {
      setStepErrorMessage(err.message || "Failed to create project");
    } finally {
      setStepSubmitting(false);
    }
  };

  const handleGoalSuggest = async () => {
    if (!workspaceId || !userId || !goalForm.projectId) {
      setStepErrorMessage("Select a project before asking AI.");
      return;
    }
    const project = projects.find((p) => p.id === goalForm.projectId);
    if (!project) {
      setStepErrorMessage("Project not found");
      return;
    }
    setGoalSuggestionLoading(true);
    setStepErrorMessage(null);
    try {
      const response = await askWorkspaceQuestion({
        workspace_id: workspaceId,
        user_id: userId,
        question: `Suggest 3 measurable goals for a project called "${project.title}". Format as bullet points.`,
      });
      setGoalForm((prev) => ({ ...prev, goals: response.answer }));
    } catch (err: any) {
      setStepErrorMessage(err.message || "AI goal suggestion failed");
    } finally {
      setGoalSuggestionLoading(false);
    }
  };

  const handleGoalSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !goalForm.projectId) {
      setStepErrorMessage("Select a project before saving goals.");
      return;
    }
    const project = projects.find((p) => p.id === goalForm.projectId);
    if (!project) {
      setStepErrorMessage("Project not found");
      return;
    }
    if (!goalForm.goals.trim()) {
      setStepErrorMessage("Add at least one goal.");
      return;
    }
    setStepSubmitting(true);
    setStepMessage(null);
    setStepErrorMessage(null);
    try {
      await updateProject(project.id, {
        title: project.title,
        description: project.description,
        goals: goalForm.goals.trim(),
        workspace_id: workspaceId,
        target_personas: [],
      });
      setProjects((prev) => prev.map((entry) => (entry.id === project.id ? { ...entry, goals: goalForm.goals.trim() } : entry)));
      setStepMessage("Goals saved.");
      await completeStep("set_goals");
    } catch (err: any) {
      setStepErrorMessage(err.message || "Failed to update goals");
    } finally {
      setStepSubmitting(false);
    }
  };

  const handleOpenRoadmapModule = async () => {
    if (!workspaceId || !roadmapForm.projectId) {
      setStepErrorMessage("Select a project before opening the roadmap module.");
      return;
    }
    setStepMessage(null);
    setStepErrorMessage(null);
    navigate(`/workspaces/${workspaceId}/projects/detail/${roadmapForm.projectId}/roadmap`);
    await completeStep("generate_roadmap");
    setStepMessage("Roadmap chat opened in a new tab. Ask your agent to generate the plan there.");
  };

  const handleOpenPrdModule = async () => {
    if (!workspaceId || !prdProjectId) {
      setStepErrorMessage("Select a project before opening the PRD module.");
      return;
    }
    setStepMessage(null);
    setStepErrorMessage(null);
    navigate(`/workspaces/${workspaceId}/projects/detail/${prdProjectId}/prd`);
    await completeStep("write_prd");
    setStepMessage("PRD workspace opened. Ask your agent to draft or refine the spec there.");
  };

  const handleOpenAgentModule = async () => {
    if (!workspaceId) {
      setStepErrorMessage("Workspace context missing.");
      return;
    }
    setStepMessage(null);
    setStepErrorMessage(null);
    navigate(`/workspaces/${workspaceId}/agents`);
    await completeStep("build_agent");
    setStepMessage("Agent builder opened. Configure your teammate in the dedicated module.");
  };

  const renderActiveStepContent = () => {
    const projectOptions = projects.map((project) => (
      <option key={project.id} value={project.id}>
        {project.title}
      </option>
    ));

    switch (selectedStep) {
      case "create_project":
        return (
          <form onSubmit={handleProjectSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-600">
                Project name
                <input
                  value={projectForm.title}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  placeholder="AI Roadmap Assistant"
                />
              </label>
              <label className="text-sm font-semibold text-slate-600">
                Focus
                <select
                  value={projectForm.focus}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, focus: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {PROJECT_FOCUS_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm font-semibold text-slate-600">
              One-line description
              <textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                placeholder="AI PM that keeps roadmap, tasks, and launch docs aligned."
                rows={2}
              />
            </label>
            <label className="text-sm font-semibold text-slate-600">
              Product website or URL (optional)
              <input
                value={projectForm.website_url}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, website_url: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                placeholder="https://example.com/launch"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                We&apos;ll crawl this page so the AI can pull positioning and research for PRDs, roadmaps, and agent insights.
              </span>
            </label>
            <label className="text-sm font-semibold text-slate-600">
              Launch goal (optional)
              <input
                value={projectForm.goal}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, goal: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                placeholder="Hit 5 design partner installs"
              />
            </label>
            <div className="flex justify-end">
              <button type="submit" disabled={stepSubmitting} className={PRIMARY_BUTTON}>
                {stepSubmitting ? "Creating..." : STEP_DETAILS[selectedStep].actionLabel}
              </button>
            </div>
          </form>
        );
      case "set_goals":
        return (
          <form onSubmit={handleGoalSubmit} className="space-y-4">
            <label className="text-sm font-semibold text-slate-600">
              Project
              <select
                value={goalForm.projectId}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, projectId: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {projectOptions}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-600">
              Goals
              <textarea
                value={goalForm.goals}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, goals: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                rows={4}
                placeholder="• Increase weekly active builders by 20%\n• Launch beta with 5 customers"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleGoalSuggest}
                disabled={goalSuggestionLoading}
                className={`${SECONDARY_BUTTON} flex items-center gap-2`}
              >
                {goalSuggestionLoading ? "Asking AI..." : "Suggest goals with AI"}
              </button>
              <button type="submit" disabled={stepSubmitting} className={PRIMARY_BUTTON}>
                {stepSubmitting ? "Saving..." : STEP_DETAILS[selectedStep].actionLabel}
              </button>
            </div>
          </form>
        );
      case "generate_roadmap":
        return (
          <div className="space-y-4">
            <label className="text-sm font-semibold text-slate-600">
              Project
              <select
                value={roadmapForm.projectId}
                onChange={(event) => setRoadmapForm((prev) => ({ ...prev, projectId: event.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {projectOptions}
              </select>
            </label>
            <p className="text-sm text-slate-600">
              We’ll open the roadmap module so you can brainstorm in chat with your AI partner. Ask for timelines,
              milestones, and risks while you see the document update live.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={handleOpenRoadmapModule} className={PRIMARY_BUTTON}>
                Open roadmap module
              </button>
            </div>
          </div>
        );
      case "write_prd":
        return (
          <div className="space-y-4">
            <label className="text-sm font-semibold text-slate-600">
              Project
              <select
                value={prdProjectId}
                onChange={(event) => setPrdProjectId(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {projectOptions}
              </select>
            </label>
            <p className="text-sm text-slate-600">
              We’ll open the PRD module so you can walk through the document with AI, capture requirements, and publish
              the draft directly to decision makers.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={handleOpenPrdModule} className={PRIMARY_BUTTON}>
                Open PRD module
              </button>
            </div>
          </div>
        );
      case "build_agent":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Launch the full agent module to configure personas, tools, and automations with richer controls. We&apos;ll
              keep this checklist updated once you jump in.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>Pick from ready-made agent templates or start from scratch.</li>
              <li>Grant project access so your agent can work inside PRDs, tasks, and roadmap views.</li>
              <li>Iterate quickly with previews before sharing across the workspace.</li>
            </ul>
            <div className="flex justify-end">
              <button type="button" onClick={handleOpenAgentModule} className={PRIMARY_BUTTON}>
                {STEP_DETAILS[selectedStep].actionLabel}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderProjectLaunchpad = () => (
    <section className="relative overflow-hidden rounded-[48px] border border-white/10 bg-gradient-to-br from-[#0b1227] via-[#1d1f4b] to-[#5b1a82] p-1 text-white shadow-[0_50px_120px_-60px_rgba(15,23,42,0.65)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_rgba(15,23,42,0)_60%)]" />
      <div className="relative grid gap-8 rounded-[46px] border border-white/15 bg-white/5 p-6 backdrop-blur-sm sm:p-10 lg:grid-cols-[minmax(0,1.3fr),minmax(320px,1fr)]">
        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">Project launchpad</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
              Describe what you want to build, {greetingName}.
            </h2>
            <p className="mt-2 text-sm text-white/80">
              {agentName} will spin it into a workspace-ready project with goals, docs, and AI context.
            </p>
            {partnerFocus.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {partnerFocus.map((focus) => (
                  <span key={focus} className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                    {focus}
                  </span>
                ))}
              </div>
            )}
          </div>
          <form onSubmit={handleQuickProjectCreate} className="space-y-4">
            <div className="rounded-[36px] border border-white/30 bg-white/90 p-5 text-slate-900 shadow-[0_30px_60px_rgba(15,23,42,0.35)]">
              <textarea
                value={quickProjectIdea}
                onChange={(event) => setQuickProjectIdea(event.target.value)}
                rows={3}
                placeholder="e.g. Build an AI co-pilot that drafts roadmap updates for enterprise customers..."
                className="w-full resize-none border-0 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                disabled={quickProjectLoading}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {PROJECT_IDEA_TEMPLATES.map((template) => (
                <button
                  type="button"
                  key={template}
                  onClick={() => setQuickProjectIdea(template)}
                  className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/60 hover:bg-white/20"
                >
                  {template}
                </button>
              ))}
            </div>
            {quickProjectError && <p className="text-sm text-rose-200">{quickProjectError}</p>}
            {quickProjectMessage && <p className="text-sm text-emerald-200">{quickProjectMessage}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={quickProjectLoading}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-900 disabled:opacity-40"
              >
                {quickProjectLoading ? "Creating..." : "Generate project"}
                <span aria-hidden="true">↗</span>
              </button>
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                AI drafts outline + goals
              </span>
            </div>
          </form>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            <span>Workspace Projects</span>
            {workspaceId && (
              <button
                type="button"
                onClick={() => navigate(`/workspaces/${workspaceId}/projects`)}
                className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
              >
                Open hub
              </button>
            )}
          </div>
          <div className="space-y-3">
            {projects.length === 0 ? (
              <div className="rounded-[32px] border border-white/20 bg-white/10 p-6 text-sm text-white/80">
                No projects yet. Describe an initiative to start collaborating with {agentName}.
              </div>
            ) : (
              projects.slice(0, 4).map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/projects/detail/${project.id}`)}
                  className="group w-full rounded-[32px] border border-white/20 bg-white/10 px-5 py-4 text-left text-white transition hover:border-white/60 hover:bg-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold">{project.title}</p>
                    <span className="text-xs font-semibold text-white/70 group-hover:text-white">Open →</span>
                  </div>
                  {project.description && (
                    <p className="mt-2 text-sm text-white/80 line-clamp-2">{project.description}</p>
                  )}
                  {project.goals && (
                    <p className="mt-2 text-xs text-white/70 line-clamp-2">{project.goals}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const renderWorkspaceSummary = () => {
    const summaryStats = [
      {
        key: "roadmap",
        label: "Roadmap",
        primary: overviewLoading ? "Loading…" : overview?.roadmap?.current_phase || "Not set",
        secondary: overviewLoading ? "" : `Completion ${overview?.roadmap?.completion_percent ?? 0}%`,
        actionLabel: "Open roadmap",
        onClick: () => openProjectSection("roadmap"),
      },
      {
        key: "tasks",
        label: "Tasks",
        primary: overviewLoading ? "Loading…" : `${overview?.tasks?.done ?? 0}/${overview?.tasks?.total ?? 0} done`,
        secondary: overviewLoading ? "" : `${overview?.tasks?.in_progress ?? 0} in progress`,
        actionLabel: "Open Kanban",
        onClick: () => openProjectSection("tasks"),
      },
      {
        key: "prds",
        label: "PRDs",
        primary: overviewLoading ? "Loading…" : prdCount > 0 ? `${prdCount} active` : "No PRDs yet",
        secondary: overviewLoading
          ? ""
          : latestPrd
            ? `Latest • ${latestPrd.title} (${new Date(latestPrd.updated_at).toLocaleDateString()})`
            : "Ask your agent to draft one.",
        actionLabel: "Open PRDs",
        onClick: () => openProjectSection("prd"),
      },
    ];

    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(260px,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workspace pulse</p>
              <p className="text-sm text-slate-500">Lightweight snapshot across projects, roadmaps, and docs.</p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Active project</p>
              {activeProject ? (
                <>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">{activeProject.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">{activeProject.description}</p>
                  <button type="button" onClick={() => openProjectSection()} className="mt-3 text-sm font-semibold text-blue-600">
                    Open project →
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Create a project so your agent has context to work from.</p>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {summaryStats.map((stat) => (
                <button
                  type="button"
                  key={stat.key}
                  onClick={stat.onClick}
                  className="group flex min-h-[180px] flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-5 text-left text-white shadow-[0_10px_30px_rgba(15,23,42,0.35)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300/80">{stat.label}</p>
                  <p className="mt-2 text-base font-semibold text-white">{stat.primary}</p>
                  {stat.secondary && <p className="mt-1 text-xs text-slate-200">{stat.secondary}</p>}
                  <span className="mt-auto text-xs font-semibold text-blue-200 transition group-hover:text-white">
                    {stat.actionLabel} →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">AI teammates</p>
          <h4 className="mt-2 text-lg font-semibold text-slate-900">{partnerName}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {partnerFocus.length ? `Focus: ${partnerFocus.join(", ")}` : "Set a focus to guide your agent."}
          </p>
          <button
            type="button"
            onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/agents`)}
            className="mt-4 text-sm font-semibold text-blue-600"
          >
            Open agent builder →
          </button>
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Meet your AI Coach</p>
            <p className="mt-1 text-sm text-slate-500">
              A dedicated agent who can answer platform questions, explain how 8product.ai works, and show how AI can
              elevate your product practice.
            </p>
            <button
              type="button"
              onClick={handleAskCoach}
              className="mt-3 w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Talk to AI Coach
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStepList = () => (
    <div className="grid gap-3 md:grid-cols-2">
      {stepsData.map((step) => {
        const detail = STEP_DETAILS[step.id];
        const isActive = selectedStep === step.id;
        return (
          <button
            type="button"
            key={step.id}
            onClick={() => setSelectedStep(step.id)}
            className={`text-left rounded-2xl border px-4 py-3 transition ${
              isActive ? "border-blue-500 bg-blue-50" : step.completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              {detail.pill}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{detail.label}</p>
            <p className="mt-1 text-xs text-slate-500">
              {step.completed ? "Completed" : detail.description}
            </p>
            {step.completed_at && (
              <p className="mt-1 text-[11px] text-slate-400">Done {new Date(step.completed_at).toLocaleDateString()}</p>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderChecklist = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Getting Started</p>
      <ul className="mt-4 space-y-3">
        {stepsData.map((step) => (
          <li key={step.id} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                step.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {step.completed ? "✓" : "•"}
            </span>
            <span className={step.completed ? "text-slate-500 line-through" : "text-slate-700"}>
              {STEP_DETAILS[step.id].label}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Progress</span>
          <span>
            {stepsData.filter((step) => step.completed).length} of {stepsData.length} completed
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-500" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${WIDE_PAGE_CONTAINER} space-y-6 py-8 md:py-12`}>
        {renderProjectLaunchpad()}

        {(projectsError || overviewError || onboardingError) && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {projectsError || overviewError || onboardingError}
          </div>
        )}

        {projectsLoading && (
          <div className="rounded-3xl border border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
            Loading your workspace…
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr),minmax(280px,1fr)]">
          <div className="space-y-4">
            {isOnboardingComplete ? (
              <>
                {renderWorkspaceSummary()}
              </>
            ) : (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-500">
                        {STEP_DETAILS[selectedStep].pill}
                      </p>
                      <h3 className="text-2xl font-semibold text-slate-900">{STEP_DETAILS[selectedStep].label}</h3>
                      <p className="mt-1 text-sm text-slate-500">{STEP_DETAILS[selectedStep].description}</p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {renderActiveStepContent()}
                  </div>
                  {stepMessage && <p className="mt-4 text-sm text-emerald-600">{stepMessage}</p>}
                  {stepErrorMessage && <p className="mt-2 text-sm text-rose-600">{stepErrorMessage}</p>}
                </div>
                {renderStepList()}
              </>
            )}
          </div>
          <div className="space-y-4">
            {showCelebration && (
              <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-6">
                <div className="pointer-events-none absolute inset-0">
                  {CONFETTI_PIECES.map((piece, index) => (
                    <span
                      key={`${piece.left}-${piece.top}-${index}`}
                      className={`absolute h-2 w-2 rounded-sm ${piece.color} opacity-80 animate-bounce`}
                      style={{ left: piece.left, top: piece.top, animationDelay: `${piece.delay}s` }}
                    />
                  ))}
                </div>
                <div className="relative text-sm text-emerald-800">
                  <p className="text-base font-semibold text-emerald-900">🎉 All onboarding steps are complete!</p>
                  <p className="mt-2">
                    Your workspace, roadmap, PRD, and agent modules are ready. Bring teammates in so the new AI workflows
                    can keep everyone aligned.
                  </p>
                  <button
                    type="button"
                    onClick={() => workspaceId && navigate(`/workspaces/${workspaceId}/projects/members`)}
                    className="mt-3 font-semibold text-emerald-900 underline"
                  >
                    Invite teammates →
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-[#f3f7ff] via-[#f8fbff] to-[#dceeff] p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Workspace updates</p>
                  <p className="mt-1 text-sm text-slate-500">Share highlights so every teammate stays aligned.</p>
                </div>
                <button
                  type="button"
                  onClick={() => loadWorkspaceUpdates()}
                  disabled={workspaceUpdatesLoading || postingWorkspaceUpdate}
                  className="text-xs font-semibold text-slate-500 transition hover:text-slate-700 disabled:opacity-40"
                >
                  Refresh
                </button>
              </div>
              <form onSubmit={handleWorkspaceUpdateSubmit} className="mt-4 space-y-3">
                <textarea
                  value={newWorkspaceUpdate}
                  onChange={(event) => setNewWorkspaceUpdate(event.target.value)}
                  placeholder="Post a quick note on progress, wins, or blockers…"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  {workspaceUpdatesError && <span className="text-rose-500">{workspaceUpdatesError}</span>}
                  <button
                    type="submit"
                    disabled={postingWorkspaceUpdate}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {postingWorkspaceUpdate ? "Posting…" : "Post update"}
                  </button>
                </div>
              </form>
              <div className="mt-4 space-y-3">
                {workspaceUpdatesLoading && workspaceUpdates.length === 0 ? (
                  <p className="text-sm text-slate-500">Loading updates…</p>
                ) : visibleWorkspaceUpdates.length === 0 ? (
                  <p className="text-sm text-slate-500">No updates shared yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {visibleWorkspaceUpdates.map((update) => (
                      <li key={update.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                        <p className="text-sm text-slate-800 whitespace-pre-line">{update.content}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Posted {new Date(update.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {!isOnboardingComplete && (
              <>
                {renderChecklist()}
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Guided by AI</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Ask the AI Coach how to navigate 8product.ai, automate workflows, or apply AI to product management best
                    practices.
                  </p>
                  <button
                    type="button"
                    onClick={handleAskCoach}
                    className="mt-4 w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Talk to AI Coach
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <OnboardingModal open={showOnboarding} onStart={handleStartTour} onSkip={handleSkipTour} />
    </div>
  );
}
