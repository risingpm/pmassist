import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  createUserAgent,
  getUserAgent,
  updateUserAgent,
  signup,
  login,
  type UserAgent,
  type UserAgentPayload,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";

const NAME_SUGGESTIONS = ["Nova", "Atlas", "Lyra", "Astra", "Quill"];
const FOCUS_OPTIONS = [
  "PRD generation",
  "Roadmap creation",
  "Competitor analysis",
  "User research synthesis",
  "Launch planning",
  "Sprint planning",
];

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

const TOTAL_STEPS = 6;
const DEFAULT_NAME = NAME_SUGGESTIONS[0];
const DEFAULT_PERSONALITY: PersonalityOption = "Balanced";

const makeIntegrationMap = (source?: Record<string, unknown>) => {
  const map: Record<string, boolean> = {};
  INTEGRATION_OPTIONS.forEach(({ id }) => {
    const value = source && typeof source[id] === "boolean" ? Boolean(source[id]) : false;
    map[id] = value;
  });
  return map;
};

type FormState = {
  name: string;
  personality: PersonalityOption;
  focusAreas: string[];
  integrations: Record<string, boolean>;
};

const DEFAULT_FORM_STATE: FormState = {
  name: DEFAULT_NAME,
  personality: DEFAULT_PERSONALITY,
  focusAreas: [FOCUS_OPTIONS[0]],
  integrations: makeIntegrationMap(),
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
  const locationState = location.state as { prefillEmail?: string } | null;

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
  const [authEmail, setAuthEmail] = useState(initialAuthProfile?.email ?? "");
  const [authPassword, setAuthPassword] = useState("");
  useEffect(() => {
    if (locationState?.prefillEmail) {
      setAuthEmail(locationState.prefillEmail);
    }
  }, [locationState]);

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  });
  const [workspaceName, setWorkspaceName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY);
  });

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

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(() => {
    if (queryUserId) return queryUserId;
    if (initialAuthProfile?.id) return initialAuthProfile.id;
    return null;
  });
  const isAuthenticated = Boolean(resolvedUserId);
  const signedInEmail = authProfile?.email ?? authEmail;

  useEffect(() => {
    if (!queryUserId) {
      return;
    }
    setAuthProfile(null);
    setAuthEmail("");
    setAuthPassword("");
    setResolvedUserId(queryUserId);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(AUTH_USER_KEY);
      window.sessionStorage.setItem(USER_ID_KEY, queryUserId);
    }
  }, [queryUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (authProfile) {
      window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authProfile));
      window.sessionStorage.setItem(USER_ID_KEY, authProfile.id);
    }
  }, [authProfile]);

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
          } else {
            setAgentExists(false);
            setExistingAgent(null);
            setShowExistingAgentPrompt(false);
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
      name: agent.name || DEFAULT_NAME,
      personality,
      focusAreas,
      integrations,
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

    try {
      let activeUserId = resolvedUserId;
      let currentAgentExists = agentExists;

      if (!activeUserId) {
        const trimmedEmail = authEmail.trim().toLowerCase();
        if (!trimmedEmail || !authPassword.trim()) {
          setSubmitError("Enter your email and password to continue.");
          setIsSubmitting(false);
          return;
        }

        const creds = { email: trimmedEmail, password: authPassword };
        const authResult = await signup(creds);

        activeUserId = authResult.id;
        setAuthProfile(authResult);
        setResolvedUserId(authResult.id);
        setAuthEmail(authResult.email);
        setAuthPassword("");
        const newWorkspaceId = authResult.workspace_id ?? null;
        const newWorkspaceName = authResult.workspace_name ?? null;
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authResult));
          window.sessionStorage.setItem(USER_ID_KEY, authResult.id);
          if (newWorkspaceId) window.sessionStorage.setItem(WORKSPACE_ID_KEY, newWorkspaceId);
          if (newWorkspaceName) window.sessionStorage.setItem(WORKSPACE_NAME_KEY, newWorkspaceName);
        }

        if (newWorkspaceId) setWorkspaceId(newWorkspaceId);
        if (newWorkspaceName) setWorkspaceName(newWorkspaceName);
        if (newWorkspaceId) resultingWorkspaceId = newWorkspaceId;

        const agentCheck = await getUserAgent(authResult.id);
        currentAgentExists = Boolean(agentCheck);
        setAgentExists(currentAgentExists);
        if (agentCheck) {
          setExistingAgent(agentCheck);
          setShowExistingAgentPrompt(true);
        }
      } else if (!currentAgentExists) {
        try {
          const agentCheck = await getUserAgent(activeUserId);
          if (agentCheck) {
            currentAgentExists = true;
            setAgentExists(true);
            setExistingAgent(agentCheck);
            setShowExistingAgentPrompt(true);
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

      const targetWorkspace = resultingWorkspaceId || window.sessionStorage.getItem(WORKSPACE_ID_KEY);
      const nextUrl = targetWorkspace ? `/dashboard?workspace=${targetWorkspace}` : "/dashboard";
      navigate(nextUrl, { replace: true, state: { onboardingComplete: true } });
    } catch (err: any) {
      console.error("Failed to save agent", err);
      const message = extractErrorMessage(err);
      if (message.toLowerCase().includes("already in use")) {
        try {
          const trimmedEmail = authEmail.trim().toLowerCase();
          const creds = { email: trimmedEmail, password: authPassword };
          const authResult = await login(creds);
          setAuthProfile(authResult);
          setResolvedUserId(authResult.id);
          setAuthPassword("");
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authResult));
            window.sessionStorage.setItem(USER_ID_KEY, authResult.id);
            if (authResult.workspace_id) {
              window.sessionStorage.setItem(WORKSPACE_ID_KEY, authResult.workspace_id);
              setWorkspaceId(authResult.workspace_id);
              resultingWorkspaceId = authResult.workspace_id;
            }
            if (authResult.workspace_name) {
              window.sessionStorage.setItem(WORKSPACE_NAME_KEY, authResult.workspace_name);
              setWorkspaceName(authResult.workspace_name);
            }
          }
          setSubmitError("Email already in use. Signed you in instead; please continue.");
          return;
        } catch (loginErr) {
          console.error("Auto-signin after duplicate email failed", loginErr);
          setSubmitError("Email already in use. Try signing in instead.");
        }
      } else {
        setSubmitError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = Math.round((step / (TOTAL_STEPS - 1)) * 100);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-500">
              Welcome to PM Assist
            </p>
            <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
              Your personal AI Product Manager begins here
            </h1>
            <p className="mx-auto max-w-xl text-base text-slate-500 sm:text-lg">
              Set up an assistant that reflects your style, priorities, and tools. You bring the vision—your agent handles the busywork.
            </p>
            <button
              onClick={goToNext}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => navigate("/signin")}
              className="block text-sm font-semibold text-blue-500 underline-offset-4 transition hover:text-blue-600 hover:underline"
            >
              Already have an account? Sign in
            </button>
          </div>
        );
      case 1:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900">Name your AI PM</h2>
              <p className="mt-2 text-sm text-slate-500">Give your agent a name the team will rally behind.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">
                Agent name
                <input
                  value={formState.name}
                  onChange={(event) => {
                    setFormState((prev) => ({ ...prev, name: event.target.value }));
                    setStepError(null);
                  }}
                  type="text"
                  placeholder="e.g. Nova"
                  className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                {NAME_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setFormState((prev) => ({ ...prev, name: suggestion }));
                      setStepError(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      formState.name === suggestion
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900">Choose a personality</h2>
              <p className="mt-2 text-sm text-slate-500">Pick how your agent communicates, prioritises, and collaborates.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.keys(PERSONALITY_DETAILS) as PersonalityOption[]).map((option) => {
                const isActive = formState.personality === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setFormState((prev) => ({ ...prev, personality: option }));
                      setStepError(null);
                    }}
                    className={`rounded-3xl border px-5 py-6 text-left transition ${
                      isActive
                        ? "border-blue-500 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:shadow"
                    }`}
                  >
                    <h3 className="text-lg font-semibold text-slate-900">{option}</h3>
                    <p className="mt-2 text-sm text-slate-500">{PERSONALITY_DETAILS[option]}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900">Focus areas</h2>
              <p className="mt-2 text-sm text-slate-500">Select what your agent should excel at from day one.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FOCUS_OPTIONS.map((option) => {
                const isSelected = formState.focusAreas.includes(option);
                return (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-4 transition ${
                      isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-600"
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
                    <span className="text-sm font-medium text-slate-700">{option}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900">Connect integrations</h2>
              <p className="mt-2 text-sm text-slate-500">Toggle the tools you plan to connect. We’ll guide you through setup soon.</p>
            </div>
            <div className="space-y-4">
              {INTEGRATION_OPTIONS.map((integration) => {
                const enabled = formState.integrations[integration.id];
                return (
                  <div
                    key={integration.id}
                    className={`flex items-start justify-between rounded-3xl border px-5 py-4 transition ${
                      enabled ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"
                    }`}
                  >
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{integration.label}</h3>
                      <p className="mt-1 text-sm text-slate-500">{integration.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormState((prev) => ({
                          ...prev,
                          integrations: {
                            ...prev.integrations,
                            [integration.id]: !enabled,
                          },
                        }));
                        setStepError(null);
                      }}
                      className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                        enabled
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {enabled ? "Enabled" : "Enable"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900">Review & authenticate</h2>
              <p className="mt-2 text-sm text-slate-500">
                Confirm the agent details, then create your account or sign in to continue.
              </p>
            </div>
              <div className="space-y-6 overflow-hidden">
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
              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Agent name</p>
                    <p className="text-lg font-semibold text-slate-900">{formState.name || DEFAULT_NAME}</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-blue-600"
                    onClick={() => setStep(1)}
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Personality</p>
                    <p className="text-lg font-semibold text-slate-900">{formState.personality}</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-blue-600"
                    onClick={() => setStep(2)}
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Focus areas</p>
                  <div className="flex flex-wrap gap-2">
                    {formState.focusAreas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="self-start text-sm font-semibold text-blue-600"
                    onClick={() => setStep(3)}
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Integrations</p>
                  <div className="flex flex-wrap gap-2">
                    {INTEGRATION_OPTIONS.map((integration) => (
                      <span
                        key={integration.id}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          formState.integrations[integration.id]
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {integration.label}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="self-start text-sm font-semibold text-blue-600"
                    onClick={() => setStep(4)}
                  >
                    Edit
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {isAuthenticated ? "You're signed in" : "Create your account"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {isAuthenticated
                        ? "You're ready to save updates to this agent."
                        : "Use your email and a password to save this agent for future sessions."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/signin")}
                    className="text-xs font-semibold uppercase tracking-wide text-blue-500 hover:text-blue-600"
                  >
                    {isAuthenticated ? "Switch account" : "I already have an account"}
                  </button>
                </div>

                {isAuthenticated ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Signed in as <span className="font-semibold text-slate-900">{signedInEmail}</span>
                  </div>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-slate-600">
                      Email
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(event) => {
                          setAuthEmail(event.target.value);
                          setStepError(null);
                          setSubmitError(null);
                        }}
                        placeholder="you@company.com"
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-600">
                      Password
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(event) => {
                          setAuthPassword(event.target.value);
                          setStepError(null);
                          setSubmitError(null);
                        }}
                        minLength={8}
                        placeholder="Minimum 8 characters"
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </>
                )}
                <p className="text-xs text-slate-400">
                  Passwords are stored securely so you can return and keep iterating.
                </p>
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

            <div className="rounded-3xl bg-blue-50 px-6 py-5 text-sm text-blue-700">
              Your agent will greet conversations with a personalised system prompt tailored to this setup.
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-[32px] bg-white p-8 shadow-2xl sm:p-10">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">
                Onboarding
              </p>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Create your AI PM Agent</h1>
            </div>
            <div className="w-full sm:w-56 overflow-hidden">
              <div className="h-2 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 text-right text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Step {step + 1} of {TOTAL_STEPS}
              </div>
            </div>
          </div>

          {loadingAgent ? (
            <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-20 text-sm text-slate-500">
              Loading your agent setup...
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-3xl bg-white/40 p-6">
              <div className="onboarding-step-animate" key={step}>
                {renderStep()}
              </div>
            </div>
          )}

          {(stepError || submitError || loadError) && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-600">
              {submitError || stepError || loadError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400">
              Step {step + 1} of {TOTAL_STEPS}
            </div>
            <div className="flex flex-wrap gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={goToPrevious}
                  className="inline-flex items-center justify-center rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  Back
                </button>
              )}

              {step < TOTAL_STEPS - 1 ? (
                step === 0 ? null : (
                  <button
                    type="button"
                    onClick={goToNext}
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Continue
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Let's Get Started"}
                </button>
              )}

              {step === 0 && (
                <button
                  type="button"
                  onClick={goToNext}
                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 sm:hidden"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function validateStep(currentStep: number, form: FormState): string | null {
  switch (currentStep) {
    case 1:
      if (!form.name.trim()) {
        return "Give your agent a name to continue.";
      }
      return null;
    case 2:
      if (!form.personality) {
        return "Select a personality style.";
      }
      return null;
    case 3:
      if (form.focusAreas.length === 0) {
        return "Choose at least one focus area.";
      }
      return null;
    default:
      return null;
  }
}
