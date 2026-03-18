import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from "@react-oauth/google";

import {
  createUserAgent,
  getUserAgent,
  updateUserAgent,
  loginWithGoogle,
  initializeWorkspace,
  createWorkspace,
  updateWorkspaceOnboardingStatus,
  createBillingCheckoutSession,
  type UserAgent,
  type UserAgentPayload,
  type AuthResponse,
} from "../api";
import {
  AUTH_USER_KEY,
  USER_ID_KEY,
  WORKSPACE_ID_KEY,
  WORKSPACE_NAME_KEY,
  DEFAULT_AGENT_NAME,
  DEMO_INITIALIZED_KEY,
  DEMO_WORKSPACE_ID_KEY,
  DEMO_PROJECT_ID_KEY,
} from "../constants";
import { setStoredAgentProfile } from "../utils/agentProfile";
import profileNextIcon from "../assets/onboarding/profile-next.svg";
import googleIcon from "../assets/onboarding/google-icon.svg";
import featurePrdIcon from "../assets/onboarding/feature-prd.svg";
import featureRoadmapIcon from "../assets/onboarding/feature-roadmap.svg";
import featureTasksIcon from "../assets/onboarding/feature-tasks.svg";
import featureAgentsIcon from "../assets/onboarding/feature-agents.svg";
import featureIntegrationsIcon from "../assets/onboarding/feature-integrations.svg";
import platformBackIcon from "../assets/onboarding/platform-back.svg";
import platformNextIcon from "../assets/onboarding/platform-next.svg";
import workspaceCheckIcon from "../assets/onboarding/workspace-check.svg";
import workspaceBackIcon from "../assets/onboarding/workspace-back.svg";
import workspaceNextIcon from "../assets/onboarding/workspace-next.svg";
import assistantIcon from "../assets/onboarding/assistant-icon.svg";
import assistantNoteIcon from "../assets/onboarding/assistant-note.svg";
import assistantBackIcon from "../assets/onboarding/assistant-back.svg";
import assistantNextIcon from "../assets/onboarding/assistant-next.svg";

const NAME_SUGGESTIONS = ["Nova", "Atlas", "Lyra", "Astra", "Quill"];
const FOCUS_OPTIONS = [
  "PRD generation",
  "Roadmap creation",
  "Competitor analysis",
  "User research synthesis",
  "Launch planning",
  "Sprint planning",
];

const FOCUS_DETAILS: Record<string, string> = {
  "PRD generation": "Draft structured requirement docs with goals, personas, and metrics baked in.",
  "Roadmap creation": "Translate strategy into phased outcome plans backed by stories and milestones.",
  "Competitor analysis": "Track market signals, summarize differentiation, and surface risks automatically.",
  "User research synthesis": "Summarize interviews, feedback, and insights into crisp takeaways.",
  "Launch planning": "Coordinate GTM checklists, approvals, and enablement for every release.",
  "Sprint planning": "Maintain agile rituals with ready-made agendas, retros, and action tracking.",
};

const ONBOARDING_STEPS = [
  { id: 0, title: "Your profile", summary: "Share your details so we can personalize onboarding." },
  { id: 1, title: "Platform features", summary: "See what you can do and pick a primary goal." },
  { id: 2, title: "Workspace", summary: "Create your workspace and start building." },
  { id: 3, title: "AI assistant", summary: "Choose a name for your AI teammate." },
] as const;

const PERSONALITY_DETAILS = {
  Analytical: "Data-driven, structured, and focused on evidence-based decisions.",
  Creative: "Imaginative, vision-led, and skilled at storytelling across teams.",
  Balanced: "Empathetic, pragmatic, and able to bridge strategy with execution.",
} as const;

type PersonalityOption = keyof typeof PERSONALITY_DETAILS;

type IntegrationOption = {
  id: string;
  label: string;
  description: string;
};

const INTEGRATION_OPTIONS: IntegrationOption[] = [
  {
    id: "jira",
    label: "Jira",
    description: "Sync planning artifacts and track delivery effortlessly.",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Bring your AI PM into team conversations and stand-ups.",
  },
  {
    id: "notion",
    label: "Notion",
    description: "Publish docs and project updates to your product wiki.",
  },
];

const PLAN_OPTIONS = [
  {
    id: "trial",
    name: "Free Trial",
    price: "$0",
    highlight: "Start for free",
    credits: "Includes 200 AI credits",
    description: "Explore PM Assist with a limited credit pack to get a feel for the workflow.",
    features: ["Full onboarding checklist", "Limited workspace automations", "Community support"],
    requiresCheckout: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49 /mo",
    highlight: "Most popular",
    credits: "Unlimited AI credits",
    description: "Level up solo PMs or founders with full access to automations and docs.",
    features: ["Unlimited projects", "Advanced workflow automations", "Priority support"],
    requiresCheckout: true,
  },
  {
    id: "team",
    name: "Team",
    price: "Contact us",
    highlight: "For orgs",
    credits: "Custom billing",
    description: "Roll out AI PMs across squads with governance, reporting, and workspace controls.",
    features: ["Shared credit pools", "Workspace analytics", "Dedicated success partner"],
    requiresCheckout: false,
  },
] as const;

type PlanId = (typeof PLAN_OPTIONS)[number]["id"];

const TOTAL_STEPS = 4;
const DEFAULT_NAME = NAME_SUGGESTIONS[0];
const DEFAULT_PERSONALITY: PersonalityOption = "Balanced";
const TEAM_SIZE_OPTIONS = [
  "Select team size",
  "Just me",
  "2-10 people",
  "11-50 people",
  "51-200 people",
  "201+ people",
];
const PRIMARY_GOAL_OPTIONS = [
  "Select your primary goal",
  "Write better PRDs",
  "Build product roadmaps",
  "Manage tasks efficiently",
  "Automate with AI agents",
  "Use all features",
];
const PLATFORM_FEATURES = [
  {
    title: "AI-Powered PRDs",
    description: "Write comprehensive PRDs with AI assistance",
    icon: featurePrdIcon,
  },
  {
    title: "Roadmap Builder",
    description: "Visualize and plan your product roadmap",
    icon: featureRoadmapIcon,
  },
  {
    title: "Task Boards",
    description: "Organize and track your team's tasks",
    icon: featureTasksIcon,
  },
  {
    title: "Custom Agents",
    description: "Build AI agents for automated workflows",
    icon: featureAgentsIcon,
  },
  {
    title: "Tool Integrations",
    description: "Connect with your favorite tools",
    icon: featureIntegrationsIcon,
  },
];
const PROFILE_NEXT_ICON_URL = profileNextIcon;
const ASSISTANT_NAME_SUGGESTIONS = [
  { emoji: "🗺️", name: "Atlas" },
  { emoji: "⭐", name: "Nova" },
  { emoji: "🧠", name: "Sage" },
  { emoji: "🔮", name: "Echo" },
  { emoji: "🌐", name: "Nexus" },
  { emoji: "☯️", name: "Zen" },
  { emoji: "⚡", name: "Pulse" },
  { emoji: "🌌", name: "Orbit" },
  { emoji: "🌙", name: "Luna" },
  { emoji: "✨", name: "Spark" },
];

const makeIntegrationMap = (source?: Record<string, unknown>) => {
  const map: Record<string, boolean> = {};
  INTEGRATION_OPTIONS.forEach(({ id }) => {
    const value = source && typeof source[id] === "boolean" ? Boolean(source[id]) : false;
    map[id] = value;
  });
  return map;
};

type FormState = {
  fullName: string;
  email: string;
  company: string;
  teamSize: string;
  primaryGoal: string;
  workspaceName: string;
  name: string;
  personality: PersonalityOption;
  focusAreas: string[];
  integrations: Record<string, boolean>;
  selectedPlan: PlanId;
};

const DEFAULT_FORM_STATE: FormState = {
  fullName: "",
  email: "",
  company: "",
  teamSize: "",
  primaryGoal: "",
  workspaceName: "",
  name: DEFAULT_NAME,
  personality: DEFAULT_PERSONALITY,
  focusAreas: [...FOCUS_OPTIONS],
  integrations: makeIntegrationMap(),
  selectedPlan: PLAN_OPTIONS[0].id,
};

const isPersonality = (value: unknown): value is PersonalityOption =>
  typeof value === "string" && value in PERSONALITY_DETAILS;

const toApiPayload = (form: FormState): UserAgentPayload => ({
  name: form.name.trim() || DEFAULT_NAME,
  personality: form.personality,
  focus_areas: form.focusAreas,
  integrations: Object.fromEntries(
    Object.entries(form.integrations).map(([key, enabled]) => [key, { enabled }])
  ),
});

export default function OnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM_STATE);
  const [step, setStep] = useState<number>(0);
  const [agentExists, setAgentExists] = useState(false);
  const [existingAgent, setExistingAgent] = useState<UserAgent | null>(null);
  const [showExistingAgentPrompt, setShowExistingAgentPrompt] = useState(false);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const queryUserId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const candidate = params.get("user");
    return candidate && candidate.trim().length > 0 ? candidate.trim() : null;
  }, [location.search]);

  const initialAuthProfile = useMemo(() => {
    if (queryUserId || typeof window === "undefined") {
      return null;
    }
    const raw = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { id?: string; email?: string };
      if (parsed?.id && parsed?.email) {
        return { id: parsed.id, email: parsed.email };
      }
    } catch {
      // ignore parse errors
    }
    return null;
  }, [queryUserId]);

  const [authProfile, setAuthProfile] = useState<{ id: string; email: string } | null>(
    initialAuthProfile
  );

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  const [workspaceName, setWorkspaceName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
  });
  const [workspaceDraft, setWorkspaceDraft] = useState("");

  useEffect(() => {
    if (workspaceName && !workspaceDraft) {
      setWorkspaceDraft(workspaceName);
      setFormState((prev) => ({ ...prev, workspaceName }));
    }
  }, [workspaceDraft, workspaceName]);

  useEffect(() => {
    if (!authProfile?.email || formState.email.trim()) {
      return;
    }
    setFormState((prev) => ({ ...prev, email: authProfile.email }));
  }, [authProfile, formState.email]);
  const maybeInitializeDemoWorkspace = useCallback(
    async (authResult: AuthResponse) => {
      if (typeof window === "undefined" || !authResult.id) return null;
      const alreadyInitialized = window.localStorage.getItem(DEMO_INITIALIZED_KEY) === "true";
      if (alreadyInitialized) {
        return null;
      }
      try {
        const result = await initializeWorkspace(authResult.id);
        window.localStorage.setItem(DEMO_INITIALIZED_KEY, "true");
        window.localStorage.setItem(DEMO_WORKSPACE_ID_KEY, result.workspace_id);
        if (result.project_id) {
          window.localStorage.setItem(DEMO_PROJECT_ID_KEY, result.project_id);
        }
        if (!authResult.workspace_id && result.workspace_id) {
          window.sessionStorage.setItem(WORKSPACE_ID_KEY, result.workspace_id);
          setWorkspaceId(result.workspace_id);
        }
        return result;
      } catch (err) {
        console.warn("Failed to initialize demo workspace", err);
        return null;
      }
    },
    []
  );

  const extractErrorMessage = (value: unknown): string => {
    if (!value) return "Something went wrong. Please try again.";
    if (value instanceof Error) {
      return extractErrorMessage(value.message);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "Something went wrong. Please try again.";
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && "detail" in parsed) {
            const detail = (parsed as Record<string, unknown>).detail;
            if (typeof detail === "string" && detail.trim().length > 0) {
              return detail;
            }
          }
        } catch {
          // fall through to returning trimmed string
        }
      }
      return trimmed;
    }
    if (typeof value === "object" && value) {
      const detail = (value as Record<string, unknown>).detail;
      if (typeof detail === "string" && detail.trim().length > 0) {
        return detail;
      }
    }
    return "Something went wrong. Please try again.";
  };

  const persistAuthSession = (authResult: AuthResponse) => {
    setAuthProfile({ id: authResult.id, email: authResult.email });
    setResolvedUserId(authResult.id);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authResult));
      window.sessionStorage.setItem(USER_ID_KEY, authResult.id);
      if (authResult.workspace_id) {
        window.sessionStorage.setItem(WORKSPACE_ID_KEY, authResult.workspace_id);
        setWorkspaceId(authResult.workspace_id);
      }
      if (authResult.workspace_name) {
        window.sessionStorage.setItem(WORKSPACE_NAME_KEY, authResult.workspace_name);
        setWorkspaceName(authResult.workspace_name);
      }
    }
  };

  const clearAuthSession = () => {
    setAuthProfile(null);
    setResolvedUserId(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(AUTH_USER_KEY);
      window.sessionStorage.removeItem(USER_ID_KEY);
      window.sessionStorage.removeItem(WORKSPACE_ID_KEY);
      window.sessionStorage.removeItem(WORKSPACE_NAME_KEY);
    }
    setWorkspaceId(null);
    setWorkspaceName(null);
    setStoredAgentProfile(null);
  };

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(() => {
    if (queryUserId) return queryUserId;
    if (initialAuthProfile?.id) return initialAuthProfile.id;
    return null;
  });
  const isAuthenticated = Boolean(resolvedUserId);
  const signedInEmail = authProfile?.email ?? "";

  useEffect(() => {
    if (!queryUserId) {
      return;
    }
    setAuthProfile(null);
    setResolvedUserId(queryUserId);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(AUTH_USER_KEY);
      window.sessionStorage.setItem(USER_ID_KEY, queryUserId);
    }
  }, [queryUserId]);

  useEffect(() => {
    if (step > 3) {
      setStep(3);
    }
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (authProfile) {
      window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authProfile));
      window.sessionStorage.setItem(USER_ID_KEY, authProfile.id);
    }
  }, [authProfile]);

  const handleGoogleCredential = async (credential: string) => {
    setStepError(null);
    try {
      const authResult = await loginWithGoogle(credential);
      persistAuthSession(authResult);
      await maybeInitializeDemoWorkspace(authResult);
    } catch (err) {
      console.error("Google sign-in failed during onboarding", err);
      setStepError(extractErrorMessage(err));
    }
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setStepError("Google did not return a credential. Please try again.");
      return;
    }
    await handleGoogleCredential(response.credential);
  };

  const handleGoogleError = () => {
    setStepError("Unable to authenticate with Google. Please try again.");
  };

  const handleFinalizeOnboarding = async () => {
    const validationError = validateStep(3, formState);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    if (!resolvedUserId) {
      setStepError("Connect your Google account before continuing.");
      return;
    }

    setStepError(null);
    setIsSubmitting(true);

    try {
      const payload = toApiPayload({ ...formState, name: formState.name.trim() || DEFAULT_NAME });
      let agent = existingAgent;
      if (agent) {
        agent = await updateUserAgent(resolvedUserId, payload);
      } else {
        agent = await createUserAgent(resolvedUserId, payload);
      }
      if (!agent) {
        throw new Error("Unable to save your AI assistant settings.");
      }
      setAgentExists(true);
      setExistingAgent(agent);
      setStoredAgentProfile({ name: agent.name || DEFAULT_AGENT_NAME });

      const targetWorkspace = workspaceId || window.sessionStorage.getItem(WORKSPACE_ID_KEY);
      if (targetWorkspace) {
        try {
          await updateWorkspaceOnboardingStatus(
            targetWorkspace,
            {
              partner_name: payload.name,
              partner_focus: formState.focusAreas,
            },
            resolvedUserId
          );
        } catch (err) {
          console.warn("Failed to save onboarding partner details", err);
        }
      }

      if (targetWorkspace) {
        navigate(`/workspaces/${targetWorkspace}/home`, { replace: true });
      }
    } catch (err) {
      setStepError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !resolvedUserId) {
      return;
    }
    window.sessionStorage.setItem(USER_ID_KEY, resolvedUserId);
  }, [resolvedUserId]);

  useEffect(() => {
    if (!resolvedUserId) {
      setAgentExists(false);
      return;
    }

    let cancelled = false;
    const loadAgent = async () => {
      setLoadingAgent(true);
      setLoadError(null);
      try {
        const agent = await getUserAgent(resolvedUserId);
        if (!cancelled) {
          if (agent) {
            setAgentExists(true);
            setExistingAgent(agent);
            setShowExistingAgentPrompt(true);
            setStoredAgentProfile({ name: agent.name || DEFAULT_AGENT_NAME });
          } else {
            setAgentExists(false);
            setExistingAgent(null);
            setShowExistingAgentPrompt(false);
            setStoredAgentProfile(null);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to load agent", err);
          setLoadError(err.message || "Unable to load your AI PM agent.");
        }
      } finally {
        if (!cancelled) {
          setLoadingAgent(false);
        }
      }
    };

    loadAgent();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUserId]);

  const prefillFromAgent = (agent: UserAgent) => {
    const integrations = makeIntegrationMap(
      agent.integrations && typeof agent.integrations === "object"
        ? (agent.integrations as Record<string, unknown>)
        : undefined
    );

    const personality = isPersonality(agent.personality)
      ? agent.personality
      : DEFAULT_PERSONALITY;

    const focusAreas = Array.isArray(agent.focus_areas) && agent.focus_areas.length > 0
      ? agent.focus_areas.map((value) => value.toString())
      : DEFAULT_FORM_STATE.focusAreas;

    const updatedForm: FormState = {
      fullName: formState.fullName,
      email: formState.email,
      company: formState.company,
      teamSize: formState.teamSize,
      primaryGoal: formState.primaryGoal,
      workspaceName: formState.workspaceName,
      name: agent.name || DEFAULT_NAME,
      personality,
      focusAreas,
      integrations,
      selectedPlan: formState.selectedPlan,
    };

    setFormState(updatedForm);
    setStep(TOTAL_STEPS - 1);
    setAgentExists(true);
    setExistingAgent(agent);
    setShowExistingAgentPrompt(false);
  };

  const goToNext = () => {
    const validationError = validateStep(step, formState);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    if (step === TOTAL_STEPS - 2 && !isAuthenticated) {
      setStepError("Connect your account before reviewing plans.");
      return;
    }
    setStepError(null);
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };

  const goToPrevious = () => {
    setStepError(null);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    const validationError = validateStep(step, formState);
    if (validationError) {
      setStepError(validationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let resultingWorkspaceId = workspaceId;
    let activeUserId = resolvedUserId;
    let currentAgentExists = agentExists;

    if (!activeUserId) {
      setSubmitError("Connect your Google account before saving this agent.");
      setStep(TOTAL_STEPS - 2);
      setIsSubmitting(false);
      return;
    }

    try {
      if (!currentAgentExists) {
        try {
          const agentCheck = await getUserAgent(activeUserId);
          if (agentCheck) {
            currentAgentExists = true;
            setAgentExists(true);
            setExistingAgent(agentCheck);
            setShowExistingAgentPrompt(true);
            setStoredAgentProfile({ name: agentCheck.name || DEFAULT_AGENT_NAME });
          }
        } catch {
          // ignore failures when checking existing agent
        }
      }

      if (!activeUserId) {
        throw new Error("Unable to resolve your account. Please try again.");
      }

      const payload = toApiPayload(formState);
      const agent = currentAgentExists
        ? await updateUserAgent(activeUserId, payload)
        : await createUserAgent(activeUserId, payload);

      setAgentExists(true);
      setExistingAgent(agent);
      setShowExistingAgentPrompt(false);
      setStoredAgentProfile({ name: agent.name || DEFAULT_AGENT_NAME });

      const targetWorkspace = resultingWorkspaceId || window.sessionStorage.getItem(WORKSPACE_ID_KEY);
      if (targetWorkspace) {
        try {
          await updateWorkspaceOnboardingStatus(
            targetWorkspace,
            {
              partner_name: payload.name,
              partner_focus: formState.focusAreas,
            },
            activeUserId
          );
        } catch (err) {
          console.warn("Failed to store partner preferences", err);
        }
      }

      if (formState.selectedPlan === "pro") {
        if (!targetWorkspace) {
          throw new Error("We couldn't find your workspace. Please refresh the page and try again.");
        }
        const origin = typeof window !== "undefined" ? window.location.origin : null;
        const successUrl = origin ? `${origin}/workspaces/${targetWorkspace}/projects?checkout=success` : undefined;
        const cancelUrl = origin ? `${origin}/onboarding?checkout=cancelled` : undefined;
        const checkout = await createBillingCheckoutSession({
          workspaceId: targetWorkspace,
          plan: "pro",
          successUrl,
          cancelUrl,
          userId: activeUserId,
        });
        window.location.href = checkout.checkout_url;
        return;
      }

      const nextUrl = targetWorkspace ? `/workspaces/${targetWorkspace}/projects` : "/onboarding";
      navigate(nextUrl, { replace: true, state: { onboardingComplete: true } });
    } catch (err: any) {
      console.error("Failed to save agent", err);
      const message = extractErrorMessage(err);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = Math.round((step / (TOTAL_STEPS - 1)) * 100);
  const stepDescriptor = ONBOARDING_STEPS[Math.min(step, ONBOARDING_STEPS.length - 1)];
  const focusPreview = formState.focusAreas.length > 0 ? formState.focusAreas : FOCUS_OPTIONS;
  const selectedPlan = PLAN_OPTIONS.find((plan) => plan.id === formState.selectedPlan);

  const renderStep = () => {
    switch (step) {
      case 2:
        return (
          <div className="space-y-8">
            <div className="rounded-[32px] bg-gradient-to-r from-[#2023a4] via-[#6f35ff] to-[#f64bac] p-6 text-white shadow-xl shadow-indigo-500/30">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/70">Identity</p>
              <h1 className="mt-3 text-3xl font-semibold">Let's brand your AI product manager</h1>
              <p className="mt-2 text-sm text-white/80">
                Give your copilot a memorable identity. Their name and personality anchor every doc, chat, and briefing
                generated inside your workspace.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm shadow-slate-200/60">
                <span className="text-sm font-semibold text-slate-600">Agent name</span>
                <input
                  value={formState.name}
                  onChange={(event) => {
                    setFormState((prev) => ({ ...prev, name: event.target.value }));
                    setStepError(null);
                  }}
                  type="text"
                  placeholder="Nova"
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-inner shadow-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-3 text-xs text-slate-500">
                  This becomes the system voice across PRDs, chats, and roadmap briefings.
                </p>
              </label>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Personality</p>
                <div className="mt-4 space-y-3">
                  {(Object.entries(PERSONALITY_DETAILS) as [PersonalityOption, string][]).map(
                    ([option, description]) => {
                      const active = formState.personality === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setFormState((prev) => ({ ...prev, personality: option }));
                            setStepError(null);
                          }}
                          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                            active
                              ? "border-indigo-500 bg-white text-slate-900 shadow shadow-indigo-200"
                              : "border-transparent bg-slate-100 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <span className="text-slate-900">{option}</span>
                          <p className="mt-1 text-xs font-normal text-slate-500">{description}</p>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Need inspiration?</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {NAME_SUGGESTIONS.map((suggestion) => {
                  const active = formState.name === suggestion;
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setFormState((prev) => ({ ...prev, name: suggestion }));
                        setStepError(null);
                      }}
                      className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="rounded-[32px] border border-slate-100 bg-slate-50 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Skills grid</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">Where should your agent lead?</h2>
              <p className="mt-2 text-sm text-slate-500">
                Pick every workflow your AI PM should be accountable for. You can widen or narrow scope anytime.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {FOCUS_OPTIONS.map((option, index) => {
                const isSelected = formState.focusAreas.includes(option);
                return (
                  <label
                    key={option}
                    className={`group relative flex h-full cursor-pointer flex-col rounded-3xl border px-5 py-5 transition ${
                      isSelected
                        ? "border-indigo-500 bg-white shadow shadow-indigo-100"
                        : "border-slate-200 bg-white hover:border-indigo-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      onChange={() => {
                        setFormState((prev) => {
                          const exists = prev.focusAreas.includes(option);
                          const focusAreas = exists
                            ? prev.focusAreas.filter((item) => item !== option)
                            : [...prev.focusAreas, option];
                          return { ...prev, focusAreas };
                        });
                        setStepError(null);
                      }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{option}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                          Track {String(index + 1).padStart(2, "0")}
                        </p>
                      </div>
                      <span
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold ${
                          isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isSelected ? "OK" : index + 1}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-slate-500">{FOCUS_DETAILS[option]}</p>
                  </label>
                );
              })}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            {workspaceName && (
              <div className="rounded-3xl border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-700">
                Workspace created: <span className="font-semibold">{workspaceName}</span>
              </div>
            )}
            {existingAgent && showExistingAgentPrompt && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Saved setup available</p>
                    <p className="text-amber-700/80">
                      We found an existing agent called <span className="font-semibold">{existingAgent.name}</span>. Load it or
                      continue with the details above to overwrite.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowExistingAgentPrompt(false)}
                      className="rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      Ignore saved agent
                    </button>
                    <button
                      type="button"
                      onClick={() => prefillFromAgent(existingAgent)}
                      className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                    >
                      Use saved setup
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4 rounded-[32px] border border-slate-100 bg-slate-50 px-6 py-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Agent blueprint</p>
                    <p className="text-2xl font-semibold text-slate-900">{formState.name || DEFAULT_NAME}</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-indigo-600"
                    onClick={() => setStep(2)}
                  >
                    Edit name
                  </button>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Voice</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{formState.personality}</p>
                  <p className="text-xs text-slate-500">{PERSONALITY_DETAILS[formState.personality]}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Focus areas</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-indigo-600"
                      onClick={() => setStep(3)}
                    >
                      Update
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formState.focusAreas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4 rounded-[32px] border border-slate-100 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Authentication</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {isAuthenticated ? "You're signed in" : "Connect your account"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {isAuthenticated
                        ? "You're ready to save updates to this agent."
                        : "Use Google sign-in to save this agent for future sessions."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isAuthenticated) {
                        clearAuthSession();
                      } else {
                        navigate("/signin");
                      }
                    }}
                    className="text-xs font-semibold uppercase tracking-wide text-indigo-600 hover:text-indigo-500"
                  >
                    {isAuthenticated ? "Sign out" : "I already have an account"}
                  </button>
                </div>

                {isAuthenticated ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Signed in as <span className="font-semibold text-slate-900">{signedInEmail}</span>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Google sign-in required</p>
                    <p>
                      Please return to the previous step to authenticate with Google before continuing.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Go to Google sign-in
                    </button>
                  </div>
                )}
                {existingAgent && !showExistingAgentPrompt && (
                  <button
                    type="button"
                    onClick={() => setShowExistingAgentPrompt(true)}
                    className="text-xs font-semibold text-amber-600 underline-offset-4 transition hover:text-amber-700 hover:underline"
                  >
                    Review saved agent setup
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="rounded-[32px] border border-indigo-100 bg-gradient-to-r from-[#eef0ff] to-[#fef6ff] px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Plan selection</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">Choose how you want to explore PM Assist</h2>
              <p className="mt-2 text-sm text-slate-600">
                {isAuthenticated
                  ? "You're signed in - select the workspace plan that fits. Upgrade later anytime."
                  : "Connect your Google account to unlock plan selection, then choose how you'd like to explore PM Assist."}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PLAN_OPTIONS.map((plan) => {
                const isSelected = formState.selectedPlan === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setFormState((prev) => ({ ...prev, selectedPlan: plan.id }));
                      setStepError(null);
                    }}
                    className={`flex h-full flex-col rounded-3xl border px-5 py-6 text-left transition ${
                      isSelected
                        ? "border-indigo-600 bg-white shadow-lg shadow-indigo-500/20"
                        : "border-slate-200 bg-white/80 hover:border-indigo-200"
                    }`}
                  >
                    {plan.highlight && (
                      <span className="mb-3 inline-flex w-fit items-center rounded-full bg-indigo-600/10 px-3 py-1 text-xs font-semibold text-indigo-700">
                        {plan.highlight}
                      </span>
                    )}
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-semibold text-slate-900">{plan.name}</p>
                      <span className="text-sm text-slate-500">{plan.price}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">{plan.credits}</p>
                    <p
                      className={`mt-2 text-xs font-semibold ${
                        plan.requiresCheckout ? "text-indigo-700" : "text-emerald-600"
                      }`}
                    >
                      {plan.requiresCheckout ? "Stripe checkout required" : "No credit card required"}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div
                      className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        plan.requiresCheckout ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {plan.requiresCheckout ? "Payment collected at checkout" : "Start instantly"}
                    </div>
                    <span
                      className={`mt-6 inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isSelected ? "Selected" : "Select plan"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
              Need enterprise controls or custom credits? Reach out to sales and we'll tailor a workspace rollout for your team.
            </div>
            {!isAuthenticated && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-800">
                <p className="font-semibold">Still need to connect Google?</p>
                <p className="mt-1">
                  Head back to the previous step, connect your Google account, and we'll unlock this plan selection automatically.
                </p>
                <button
                  type="button"
                  onClick={() => setStep(TOTAL_STEPS - 2)}
                  className="mt-4 inline-flex items-center rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                >
                  Go to sign-in step
                </button>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  if (step === 0) {
    const hasRequiredProfile = formState.fullName.trim() && formState.email.trim();
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center px-4 py-10"
        style={{
          backgroundImage:
            "linear-gradient(148.34071158760372deg, rgba(250, 245, 255, 1) 0%, rgba(255, 255, 255, 1) 50%, rgba(239, 246, 255, 1) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)",
        }}
      >
        <div className="flex h-[758px] w-[672px] flex-col gap-8">
          <div className="flex h-9 flex-col gap-2">
            <div className="h-2 w-full rounded-full bg-[rgba(3,2,19,0.2)]">
              <div className="h-2 rounded-full bg-[#030213]" style={{ width: "33%" }} />
            </div>
            <p className="text-center text-sm font-normal tracking-[-0.1504px] text-[#6a7282]">
              Step 1 of 4
            </p>
          </div>
          <div className="h-[690px] rounded-[16px] bg-white px-[48px] pt-[48px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
            <div className="flex h-[594px] flex-col gap-6">
              <div>
                <h1 className="text-[30px] font-bold leading-[36px] tracking-[0.3955px] text-[#0a0a0a]">
                  Tell us about yourself
                </h1>
                <p className="mt-2 text-[16px] leading-[24px] tracking-[-0.3125px] text-[#4a5565]">
                  We&apos;ll use this to personalize your experience
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-6">
                {!isAuthenticated && (
                  <div className="space-y-6">
                    {googleClientId ? (
                      <GoogleOAuthProvider clientId={googleClientId}>
                        <div className="relative h-[52px] w-full">
                          <button
                            type="button"
                            className="flex h-full w-full items-center justify-center gap-3 rounded-[10px] border-2 border-[#d1d5dc] bg-white text-[16px] font-medium tracking-[-0.3125px] text-[#364153]"
                          >
                            <img alt="" className="h-5 w-5" src={googleIcon} />
                            Continue with Google
                          </button>
                          <div className="absolute inset-0 opacity-0">
                            <GoogleLogin
                              onSuccess={handleGoogleSuccess}
                              onError={handleGoogleError}
                              theme="outline"
                              text="continue_with"
                              width="576"
                              useOneTap
                            />
                          </div>
                        </div>
                      </GoogleOAuthProvider>
                    ) : (
                      <div className="rounded-[10px] border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> to continue.
                      </div>
                    )}
                    <div className="relative flex items-center justify-center">
                      <div className="h-px w-full bg-[#d1d5dc]" />
                      <span className="absolute bg-white px-4 text-sm text-[#6a7282]">
                        or continue with email
                      </span>
                    </div>
                  </div>
                )}
                {isAuthenticated && (
                  <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Signed in as <span className="font-semibold">{signedInEmail || "your account"}</span>
                  </div>
                )}
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Full Name *
                  <input
                    value={formState.fullName}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, fullName: event.target.value }));
                      setStepError(null);
                    }}
                    type="text"
                    placeholder="John Doe"
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a] placeholder:text-[#717182] focus:border-[#0a0a0a] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Email *
                  <input
                    value={formState.email}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, email: event.target.value }));
                      setStepError(null);
                    }}
                    type="email"
                    placeholder="john@company.com"
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a] placeholder:text-[#717182] focus:border-[#0a0a0a] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Company
                  <input
                    value={formState.company}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, company: event.target.value }));
                      setStepError(null);
                    }}
                    type="text"
                    placeholder="Acme Inc."
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a] placeholder:text-[#717182] focus:border-[#0a0a0a] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Team Size
                  <select
                    value={formState.teamSize || TEAM_SIZE_OPTIONS[0]}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, teamSize: event.target.value }));
                      setStepError(null);
                    }}
                    className="h-[38px] w-full rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[14px] text-[#0a0a0a] focus:outline-none"
                  >
                    {TEAM_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {stepError && <p className="text-sm text-rose-500">{stepError}</p>}
              <div className="mt-auto flex items-center gap-4">
                <button
                  type="button"
                  onClick={async () => {
                    const validationError = validateStep(0, formState);
                    if (validationError) {
                      setStepError(validationError);
                      return;
                    }
                    setStepError(null);
                    const targetWorkspace = workspaceId || window.sessionStorage.getItem(WORKSPACE_ID_KEY);
                    if (targetWorkspace) {
                      try {
                        await updateWorkspaceOnboardingStatus(
                          targetWorkspace,
                          {
                            onboarding_profile: {
                              full_name: formState.fullName.trim(),
                              email: formState.email.trim(),
                              company: formState.company.trim() || null,
                              team_size:
                                formState.teamSize === TEAM_SIZE_OPTIONS[0]
                                  ? null
                                  : formState.teamSize,
                            },
                          },
                          resolvedUserId
                        );
                      } catch (err) {
                        console.warn("Failed to save onboarding profile", err);
                      }
                    }
                    setStep(1);
                  }}
                  disabled={!hasRequiredProfile}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                >
                  Continue
                  <img alt="" className="h-4 w-4" src={PROFILE_NEXT_ICON_URL} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    const selectedPrimaryGoal = formState.primaryGoal || PRIMARY_GOAL_OPTIONS[0];
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center px-4 py-10"
        style={{
          backgroundImage:
            "linear-gradient(145.9162176731345deg, rgba(250, 245, 255, 1) 0%, rgba(255, 255, 255, 1) 50%, rgba(239, 246, 255, 1) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)",
        }}
      >
        <div className="flex h-[860px] w-[672px] flex-col gap-6">
          <div className="flex h-9 flex-col gap-2">
            <div className="h-2 w-full rounded-full bg-[rgba(3,2,19,0.2)]">
              <div className="h-2 rounded-full bg-[#030213]" style={{ width: "50%" }} />
            </div>
            <p className="text-center text-sm font-normal tracking-[-0.1504px] text-[#6a7282]">
              Step 2 of 4
            </p>
          </div>
          <div className="h-[800px] rounded-[16px] bg-white px-[40px] pt-[40px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
            <div className="flex h-[704px] flex-col">
              <div>
                <h1 className="text-[30px] font-bold leading-[36px] tracking-[0.3955px] text-[#0a0a0a]">
                  Platform Features
                </h1>
                <p className="mt-2 text-[16px] leading-[24px] tracking-[-0.3125px] text-[#4a5565]">
                  Everything you need to excel as a Product Manager
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-3">
                {PLATFORM_FEATURES.map((feature) => (
                  <div
                    key={feature.title}
                    className="flex h-[72px] items-start gap-3 rounded-[10px] border border-[#e5e7eb] px-4 py-3"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(43, 127, 255, 1) 100%)",
                      }}
                    >
                      <img alt="" className="h-5 w-5" src={feature.icon} />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[16px] font-semibold leading-[24px] tracking-[-0.3125px] text-[#0a0a0a]">
                        {feature.title}
                      </p>
                      <p className="text-[14px] leading-[20px] tracking-[-0.1504px] text-[#4a5565]">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  What&apos;s your primary goal?
                  <select
                    value={selectedPrimaryGoal}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, primaryGoal: event.target.value }));
                      setStepError(null);
                    }}
                    className="h-[38px] w-full rounded-[8px] border border-[#d1d5dc] bg-white px-3 text-[14px] text-[#0a0a0a] focus:outline-none"
                  >
                    {PRIMARY_GOAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {stepError && <p className="mt-4 text-sm text-rose-500">{stepError}</p>}
              <div className="mt-auto flex items-center gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setStepError(null);
                    setStep(0);
                  }}
                  className="flex h-9 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                >
                  <img alt="" className="h-4 w-4" src={platformBackIcon} />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStepError(null);
                    setStep(2);
                  }}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white"
                >
                  Continue
                  <img alt="" className="h-4 w-4" src={platformNextIcon} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    const canContinue = Boolean(workspaceDraft.trim());
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center px-4 py-10"
        style={{
          backgroundImage:
            "linear-gradient(148.34071158760372deg, rgba(250, 245, 255, 1) 0%, rgba(255, 255, 255, 1) 50%, rgba(239, 246, 255, 1) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)",
        }}
      >
        <div className="flex h-[604px] w-[672px] flex-col gap-8">
          <div className="flex h-9 flex-col gap-2">
            <div className="h-2 w-full rounded-full bg-[rgba(3,2,19,0.2)]">
              <div className="h-2 rounded-full bg-[#030213]" style={{ width: "66%" }} />
            </div>
            <p className="text-center text-sm font-normal tracking-[-0.1504px] text-[#6a7282]">
              Step 3 of 4
            </p>
          </div>
          <div className="h-[536px] rounded-[16px] bg-white px-[48px] pt-[48px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
            <div className="flex h-[440px] flex-col">
              <div>
                <h1 className="text-[30px] font-bold leading-[36px] tracking-[0.3955px] text-[#0a0a0a]">
                  Create Your Workspace
                </h1>
                <p className="mt-2 text-[16px] leading-[24px] tracking-[-0.3125px] text-[#4a5565]">
                  Give your workspace a name to get started
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-6">
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Workspace Name *
                  <input
                    value={workspaceDraft}
                    onChange={(event) => {
                      setWorkspaceDraft(event.target.value);
                      setFormState((prev) => ({ ...prev, workspaceName: event.target.value }));
                      setStepError(null);
                    }}
                    type="text"
                    placeholder="Workspace name"
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a] placeholder:text-[#717182] focus:border-[#0a0a0a] focus:outline-none"
                  />
                  <span className="text-sm font-normal leading-[20px] tracking-[-0.1504px] text-[#6a7282]">
                    This will be the name of your primary workspace. You can create additional workspaces later.
                  </span>
                </label>
                <div className="rounded-[10px] border border-[#bedbff] bg-[#eff6ff] px-[17px] py-4">
                  <p className="text-[16px] font-semibold leading-[24px] tracking-[-0.3125px] text-[#1c398e]">
                    What happens next?
                  </p>
                  <div className="mt-2 space-y-2 text-[14px] leading-[20px] tracking-[-0.1504px] text-[#193cb8]">
                    {[
                      "Your workspace will be created instantly",
                      "You'll get access to all platform features",
                      "Start with guided templates and examples",
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <img alt="" className="mt-0.5 h-4 w-4" src={workspaceCheckIcon} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {stepError && <p className="mt-4 text-sm text-rose-500">{stepError}</p>}
              <div className="mt-auto flex items-center gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setStepError(null);
                    setStep(1);
                  }}
                  className="flex h-9 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                >
                  <img alt="" className="h-4 w-4" src={workspaceBackIcon} />
                  Back
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!workspaceDraft.trim()) {
                      setStepError("Enter a workspace name to continue.");
                      return;
                    }
                    if (!resolvedUserId) {
                      setStepError("Connect your Google account before creating a workspace.");
                      return;
                    }
                    setStepError(null);
                    try {
                      const created = await createWorkspace({
                        name: workspaceDraft.trim(),
                        owner_id: resolvedUserId,
                      });
                      window.sessionStorage.setItem(WORKSPACE_ID_KEY, created.id);
                      window.sessionStorage.setItem(WORKSPACE_NAME_KEY, created.name);
                      setWorkspaceId(created.id);
                      setWorkspaceName(created.name);
                      setStep(3);
                    } catch (err) {
                      setStepError(extractErrorMessage(err));
                    }
                  }}
                  disabled={!canContinue}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                >
                  Continue
                  <img alt="" className="h-4 w-4" src={workspaceNextIcon} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 3) {
    const selectedName = formState.name.trim() || DEFAULT_NAME;
    return (
      <div
        className="flex min-h-screen w-full items-center justify-center px-4 py-10"
        style={{
          backgroundImage:
            "linear-gradient(148.34071158760372deg, rgba(250, 245, 255, 1) 0%, rgba(255, 255, 255, 1) 50%, rgba(239, 246, 255, 1) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 100%)",
        }}
      >
        <div className="flex h-[768px] w-[672px] flex-col gap-8">
          <div className="flex h-9 flex-col gap-2">
            <div className="h-2 w-full rounded-full bg-[rgba(3,2,19,0.2)]">
              <div className="h-2 rounded-full bg-[#030213]" style={{ width: "83%" }} />
            </div>
            <p className="text-center text-sm font-normal tracking-[-0.1504px] text-[#6a7282]">
              Step 4 of 4
            </p>
          </div>
          <div className="h-[700px] rounded-[16px] bg-white px-[48px] pt-[48px] shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
            <div className="flex h-[604px] flex-col gap-8">
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-[16px]"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(43, 127, 255, 1) 100%)",
                  }}
                >
                  <img alt="" className="h-8 w-8" src={assistantIcon} />
                </div>
                <h1 className="mt-4 text-[30px] font-bold leading-[36px] tracking-[0.3955px] text-[#0a0a0a]">
                  Meet Your AI Assistant
                </h1>
                <p className="mt-2 text-[16px] leading-[24px] tracking-[-0.3125px] text-[#4a5565]">
                  Choose a name for your personal AI agent
                </p>
              </div>
              <div className="flex flex-col gap-6">
                <p className="text-center text-sm font-medium tracking-[-0.1504px] text-[#0a0a0a]">
                  Pick a name or create your own
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {ASSISTANT_NAME_SUGGESTIONS.map((option) => {
                    const isActive = option.name === selectedName;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => {
                          setFormState((prev) => ({ ...prev, name: option.name }));
                          setStepError(null);
                        }}
                        className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-medium transition ${
                          isActive
                            ? "border-[#ad46ff] bg-[#faf5ff] text-[#8200db] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)]"
                            : "border-[#e5e7eb] bg-white text-[#364153]"
                        }`}
                      >
                        <span className={`text-base ${isActive ? "font-semibold" : "font-medium"}`}>
                          {option.emoji}
                        </span>
                        {option.name}
                      </button>
                    );
                  })}
                </div>
                <div className="relative flex items-center justify-center">
                  <div className="h-px w-full bg-[#d1d5dc]" />
                  <span className="absolute bg-white px-3 text-sm text-[#6a7282]">or</span>
                </div>
                <label className="flex flex-col gap-2 text-sm font-medium text-[#0a0a0a]">
                  Custom Name
                  <input
                    value={formState.name}
                    onChange={(event) => {
                      setFormState((prev) => ({ ...prev, name: event.target.value }));
                      setStepError(null);
                    }}
                    type="text"
                    placeholder="Nova"
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a] placeholder:text-[#717182] focus:border-[#0a0a0a] focus:outline-none"
                  />
                </label>
                <div
                  className="rounded-[10px] px-4 py-4 text-[14px] leading-[20px] tracking-[-0.1504px] text-[#364153]"
                  style={{
                    backgroundImage:
                      "linear-gradient(172.8749836510982deg, rgba(250, 245, 255, 1) 0%, rgba(239, 246, 255, 1) 100%)",
                  }}
                >
                  <div className="flex gap-2">
                    <img alt="" className="mt-0.5 h-4 w-4" src={assistantNoteIcon} />
                    <p>
                      Your AI agent will help you with PRDs, roadmaps, task management, and more. You can always change
                      the name later in settings.
                    </p>
                  </div>
                </div>
              </div>
              {stepError && <p className="text-sm text-rose-500">{stepError}</p>}
              <div className="mt-auto flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setStepError(null);
                    setStep(2);
                  }}
                  className="flex h-9 items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] font-medium text-[#0a0a0a]"
                >
                  <img alt="" className="h-4 w-4" src={assistantBackIcon} />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeOnboarding}
                  disabled={isSubmitting}
                  className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Continue"}
                  <img alt="" className="h-4 w-4" src={assistantNextIcon} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#040223] px-4 py-10 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between text-white/80">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-semibold text-white">
              8
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-white">8product.com</span>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">AI PM Builder</p>
            </div>
          </div>
          <span className="text-sm uppercase tracking-[0.3em] text-white/60">Onboarding</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-[32px] border border-white/10 bg-white/5 px-5 py-6 shadow-[0_25px_60px_-25px_rgba(2,6,23,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Journey</p>
              <div className="mt-5 space-y-5">
                {ONBOARDING_STEPS.map((entry, index) => {
                  const status = index < step ? "complete" : index === step ? "active" : "upcoming";
                  return (
                    <div key={entry.id} className="relative pl-10">
                      {index < ONBOARDING_STEPS.length - 1 && (
                        <span className="absolute left-4 top-6 h-[calc(100%-16px)] w-px bg-white/10" aria-hidden="true" />
                      )}
                      <span
                        className={`absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-2xl text-xs font-semibold ${
                          status === "complete"
                            ? "bg-emerald-400 text-slate-900"
                            : status === "active"
                              ? "bg-white text-slate-900"
                              : "border border-white/40 text-white/60"
                        }`}
                      >
                        {status === "complete" ? "OK" : index + 1}
                      </span>
                      <p className="text-sm font-semibold text-white">{entry.title}</p>
                      <p className="text-xs text-white/60">{entry.summary}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 px-5 py-6 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Agent blueprint</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{formState.name || DEFAULT_NAME}</h3>
              <p className="text-sm text-white/70">{PERSONALITY_DETAILS[formState.personality]}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Focus</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {focusPreview.slice(0, 4).map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90"
                    >
                      {area}
                    </span>
                  ))}
                  {focusPreview.length > 4 && (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white/90">
                      +{focusPreview.length - 4}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Plan preview</p>
                <p className="mt-1 font-semibold text-white">{selectedPlan ? selectedPlan.name : PLAN_OPTIONS[0].name}</p>
                <p className="text-xs text-white/70">{selectedPlan ? selectedPlan.price : PLAN_OPTIONS[0].price}</p>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 px-5 py-6 text-sm text-white/80">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Need help?</p>
              <p className="mt-2">
                Pause anytime - your setup is auto-saved. Have a workspace already? Switch from the dropdown inside the builder.
              </p>
            </div>
          </aside>

          <section className="rounded-[36px] bg-white text-slate-900 shadow-2xl ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-8 py-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Step {step + 1} - {stepDescriptor.title}
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-900">{stepDescriptor.summary}</h1>
              </div>
              <div className="w-full max-w-[220px]">
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-[#5b4bfd] to-[#c04cf8] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-400">{progressPercent}% complete</p>
              </div>
            </div>
            <div className="px-8 pb-10 pt-8">
              {loadingAgent ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  Loading your agent setup...
                </div>
              ) : (
                <div className="relative min-h-[320px]">
                  <div className="onboarding-step-animate" key={step}>
                    {renderStep()}
                  </div>
                </div>
              )}

              {(stepError || submitError || loadError) && (
                <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-600">
                  {submitError || stepError || loadError}
                </div>
              )}

              <div className="mt-10 flex flex-col gap-3 border-t border-slate-100 pt-6 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500">We autosave your progress so you can return anytime.</p>
                <div className="flex flex-wrap gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goToPrevious}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      Back
                    </button>
                  )}
                  {step < TOTAL_STEPS - 1 ? (
                    <button
                      type="button"
                      onClick={goToNext}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
                    >
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !isAuthenticated}
                      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting
                        ? "Saving..."
                        : !isAuthenticated
                          ? "Connect to continue"
                          : formState.selectedPlan === "pro"
                            ? "Continue to checkout"
                            : "Let's Get Started"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

}

function validateStep(currentStep: number, form: FormState): string | null {
  switch (currentStep) {
    case 0:
      if (!form.fullName.trim()) {
        return "Enter your full name to continue.";
      }
      if (!form.email.trim()) {
        return "Enter your email to continue.";
      }
      return null;
    case 1:
      return null;
    case 2:
      if (!form.workspaceName.trim()) {
        return "Enter a workspace name to continue.";
      }
      return null;
    case 3:
      if (!form.name.trim()) {
        return "Give your agent a name to continue.";
      }
      return null;
    default:
      return null;
  }
}
