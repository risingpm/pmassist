import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  deleteWorkspaceAIProvider,
  getWorkspaceAIProviderStatus,
  saveWorkspaceAIProvider,
  testWorkspaceAIProvider,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY } from "../constants";

function IconBack() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7L12 3.5Z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 2.8v2.3M20.35 3.95h-2.3M3.65 17.95v2.3M4.8 19.1H2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconBrain() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <path
        d="M8.2 3.6a2.4 2.4 0 0 0-3.2 2.2c0 .2 0 .4.1.6A2.8 2.8 0 0 0 3.5 9c0 1 .5 1.8 1.2 2.3v.2a2.5 2.5 0 0 0 2.5 2.5h.2A2.7 2.7 0 0 0 10 16.2V8.3a2.5 2.5 0 0 0-1.8-4.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.8 3.6a2.4 2.4 0 0 1 3.2 2.2c0 .2 0 .4-.1.6A2.8 2.8 0 0 1 16.5 9c0 1-.5 1.8-1.2 2.3v.2a2.5 2.5 0 0 1-2.5 2.5h-.2a2.7 2.7 0 0 1-2.6 2.2V8.3a2.5 2.5 0 0 1 1.8-4.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLinkOut() {
  return (
    <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="none">
      <path d="M4 2h6v6M10 2 5.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 6.5v3h-6v-6h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 10h7M14 10v2M16 10v1.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M4.5 4h11v12h-11z" stroke="currentColor" strokeWidth="1.5" rx="2" />
      <path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M3.2 8.2 6.2 11l6.6-6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 3.5 12.5 12.5M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4-6.5-4-6.5-4Z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4-6.5-4-6.5-4Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 2.5 13.5 13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.3 14.2 13H1.8L8 2.3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6v3.5M8 11.8v.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4h11M6.2 2.5h3.6M5 4v8m3-8v8m3-8v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

type ToastTone = "success" | "error";

type ToastState = {
  tone: ToastTone;
  message: string;
};

function asCompactKey(masked: string | null | undefined, suffix: string | null | undefined) {
  if (suffix && suffix.trim()) {
    return `••••••${suffix.trim()}`;
  }
  if (!masked) {
    return "••••••••";
  }
  return masked.replace(/\*/g, "•").slice(0, 8);
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [maskedKey, setMaskedKey] = useState("••••••••");
  const [loading, setLoading] = useState(false);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftOrganization, setDraftOrganization] = useState("");
  const [draftProject, setDraftProject] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = window.sessionStorage.getItem(AUTH_USER_KEY);
    const uid = window.sessionStorage.getItem(USER_ID_KEY);
    if (!auth) {
      navigate("/signin", { replace: true });
      return;
    }
    setUserId(uid);
  }, [navigate]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    setLoading(true);
    getWorkspaceAIProviderStatus(workspaceId, userId)
      .then((result) => {
        setConnected(Boolean(result.has_api_key));
        setMaskedKey(asCompactKey(result.masked_key_preview, result.key_suffix));
      })
      .catch((error) => {
        setConnected(false);
        setToast({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to load OpenAI integration status.",
        });
      })
      .finally(() => setLoading(false));
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isConfigOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsConfigOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConfigOpen]);

  const resetConfigForm = () => {
    setDraftApiKey("");
    setDraftOrganization("");
    setDraftProject("");
    setShowApiKey(false);
  };

  const openConfigModal = () => {
    resetConfigForm();
    setIsConfigOpen(true);
  };

  const closeConfigModal = () => {
    setIsConfigOpen(false);
    resetConfigForm();
  };

  const handleSaveConfiguration = async () => {
    if (!workspaceId || !userId || !draftApiKey.trim()) {
      setToast({ tone: "error", message: "OpenAI API key is required." });
      return;
    }
    setSaving(true);
    try {
      const result = await saveWorkspaceAIProvider(workspaceId, {
        api_key: draftApiKey.trim(),
        organization: draftOrganization.trim() || null,
        project: draftProject.trim() || null,
        user_id: userId,
      });
      setConnected(Boolean(result.has_api_key));
      setMaskedKey(asCompactKey(result.masked_key_preview, result.key_suffix));
      closeConfigModal();
      setToast({ tone: "success", message: "OpenAI integration configured successfully!" });
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Failed to save OpenAI integration." });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSavedConnection = async () => {
    if (!workspaceId || !userId) return;
    setTesting(true);
    try {
      await testWorkspaceAIProvider(workspaceId, {
        use_saved_key: true,
        user_id: userId,
      });
      setToast({ tone: "success", message: "Connection test passed." });
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Connection test failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveIntegration = async () => {
    if (!workspaceId || !userId) return;
    setRemoving(true);
    try {
      await deleteWorkspaceAIProvider(workspaceId, userId);
      setConnected(false);
      setMaskedKey("••••••••");
      setToast({ tone: "success", message: "OpenAI integration removed." });
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Failed to remove OpenAI integration." });
    } finally {
      setRemoving(false);
    }
  };

  if (!workspaceId) return null;

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <header className="border-b border-[#e5e7eb] bg-white px-8 py-6">
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-2 text-[14px] font-medium text-[#0a0a0a]"
          onClick={() => navigate(`/workspaces/${workspaceId}/home`)}
        >
          <IconBack />
          Back to Dashboard
        </button>
        <h1 className="text-[30px] font-bold leading-tight text-[#101828]">Integrations</h1>
        <p className="mt-1 text-[16px] text-[#4a5565]">Connect your own AI models and external services to power your workspace</p>
      </header>

      <main className="px-8 py-8">
        <section className="rounded-[14px] border border-[#e9d4ff] bg-gradient-to-r from-[#faf5ff] to-[#eff6ff] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#9810fa]">
              <IconSparkles />
            </div>
            <div>
              <h2 className="text-[28px] font-semibold text-[#101828]">Use Your Own AI Models</h2>
              <p className="mt-1 max-w-[1020px] text-[14px] leading-[22px] text-[#364153]">
                Configure your own OpenAI API key to use GPT models across the platform. Your key is stored securely and used to power
                PRD generation, roadmap planning, and agent workflows in your workspace.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <article className="rounded-[14px] border border-black/10 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#00c950] to-[#009966] text-white">
                  <IconBrain />
                </div>
                <div>
                  <p className="text-[18px] font-semibold leading-[28px] text-[#101828]">OpenAI</p>
                  <p className="mt-1 text-[14px] text-[#6a7282]">GPT Models</p>
                </div>
              </div>
              {connected ? (
                <div className="inline-flex h-6 items-center gap-2 rounded-full bg-[#f0fdf4] px-3 text-[12px] font-medium text-[#008236]">
                  <IconCheck />
                  Connected
                </div>
              ) : (
                <div className="inline-flex h-6 items-center rounded-full bg-[#f3f4f6] px-3 text-[12px] font-medium text-[#4a5565]">Not Connected</div>
              )}
            </div>

            <p className="mt-4 text-[14px] leading-6 text-[#4a5565]">
              Connect your OpenAI API key to use GPT-4, GPT-3.5, and other models for PRD generation, roadmap planning, and AI agent
              capabilities.
            </p>

            {connected ? (
              <>
                <div className="mt-6 rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-3">
                  <p className="text-[12px] text-[#6a7282]">API Key</p>
                  <p className="mt-1 text-[14px] text-[#101828]">{maskedKey}</p>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 text-[14px] text-[#0a0a0a] disabled:opacity-60"
                    onClick={handleTestSavedConnection}
                    disabled={testing || removing || loading}
                  >
                    <IconCheck />
                    {testing ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[14px] text-[#0a0a0a]"
                    onClick={openConfigModal}
                    disabled={removing}
                  >
                    Update Key
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-10 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#dc2626] disabled:opacity-60"
                    onClick={handleRemoveIntegration}
                    disabled={removing || testing}
                    title="Remove OpenAI integration"
                  >
                    <IconTrash />
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="mt-6 flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-60"
                onClick={openConfigModal}
                disabled={loading}
              >
                <IconKey />
                {loading ? "Loading..." : "Configure Integration"}
              </button>
            )}

            <div className="mt-6 border-t border-[#e5e7eb] pt-4">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[14px] text-[#9810fa]"
              >
                Get your OpenAI API key
                <IconLinkOut />
              </a>
            </div>
          </article>

          <IntegrationComingSoon
            title="Anthropic Claude"
            subtitle="Claude AI Models"
            description="Connect Claude AI for advanced reasoning and analysis capabilities across your product management workflows."
            gradient="from-[#2b7fff] to-[#155dfc]"
          />
          <IntegrationComingSoon
            title="Google Gemini"
            subtitle="Gemini AI Models"
            description="Integrate Google's Gemini models for multimodal AI capabilities and enhanced product insights."
            gradient="from-[#ff6900] to-[#e7000b]"
          />
          <IntegrationComingSoon
            title="Custom Models"
            subtitle="Your Own API"
            description="Connect your self-hosted or custom AI models via API endpoints for complete control over your AI infrastructure."
            gradient="from-[#615fff] to-[#9810fa]"
          />
        </section>

        <section className="mt-6 rounded-[14px] border border-[#bedbff] bg-[#eff6ff] p-6">
          <h3 className="text-[28px] font-semibold text-[#101828]">Need Help?</h3>
          <p className="mt-2 text-[14px] leading-6 text-[#364153]">
            Learn more about configuring integrations, managing API keys, and best practices for using your own AI models.
          </p>
          <a
            href="https://platform.openai.com/docs"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-black/10 bg-white px-4 text-[14px] font-medium text-[#0a0a0a]"
          >
            <IconDoc />
            View Documentation
          </a>
        </section>
      </main>

      {isConfigOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[512px] overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-[0px_25px_50px_rgba(0,0,0,0.25)]">
            <div className="border-b border-[#e5e7eb] px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#00c950] to-[#009966] text-white">
                    <IconKey />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold text-[#101828]">Configure OpenAI</p>
                    <p className="text-[14px] text-[#6a7282]">Enter your OpenAI API key</p>
                  </div>
                </div>
                <button type="button" className="text-[#94a3b8]" onClick={closeConfigModal}>
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="text-[14px] font-medium text-[#364153]" htmlFor="openai-api-key">
                  OpenAI API Key *
                </label>
                <div className="mt-2 relative">
                  <input
                    id="openai-api-key"
                    type={showApiKey ? "text" : "password"}
                    className="h-9 w-full rounded-[8px] border border-transparent bg-[#f3f3f5] pl-3 pr-10 text-[14px] text-[#101828] placeholder:text-[#717182]"
                    placeholder="sk-..."
                    value={draftApiKey}
                    onChange={(event) => setDraftApiKey(event.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2 text-[#94a3b8]"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    title={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-[#6a7282]">Your API key starts with "sk-" and can be found in your OpenAI dashboard</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="h-9 rounded-[8px] border border-[#d1d5db] bg-white px-3 text-[13px] text-[#101828]"
                  placeholder="Organization (optional)"
                  value={draftOrganization}
                  onChange={(event) => setDraftOrganization(event.target.value)}
                />
                <input
                  className="h-9 rounded-[8px] border border-[#d1d5db] bg-white px-3 text-[13px] text-[#101828]"
                  placeholder="Project (optional)"
                  value={draftProject}
                  onChange={(event) => setDraftProject(event.target.value)}
                />
              </div>

              <div className="rounded-[10px] border border-[#fee685] bg-[#fffbeb] p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-[#f68a0a]">
                    <IconWarning />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-[#7b3306]">Security Notice</p>
                    <p className="mt-1 text-[12px] leading-5 text-[#973c00]">
                      Your API key is encrypted and stored securely. It is only used for AI requests configured for your workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[10px] border border-[#bedbff] bg-[#eff6ff] p-4 text-[12px] leading-5 text-[#1c398e]">
                <span className="font-bold">Don&apos;t have an API key?</span> Visit <span className="text-[#155dfc]">platform.openai.com/api-keys</span> to
                create one. You&apos;ll need an OpenAI account and billing set up.
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-5">
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] border border-black/10 bg-white text-[14px] font-medium text-[#0a0a0a]"
                onClick={closeConfigModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-[14px] font-medium text-white disabled:opacity-50"
                onClick={handleSaveConfiguration}
                disabled={!draftApiKey.trim() || saving}
              >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 top-6 z-50">
          <div
            className={`flex items-center gap-2 rounded-[8px] border px-4 py-3 text-[13px] font-medium shadow-[0px_4px_12px_rgba(0,0,0,0.1)] ${
              toast.tone === "success"
                ? "border-[#ededed] bg-white text-[#171717]"
                : "border-[#fecaca] bg-white text-[#b91c1c]"
            }`}
          >
            <span className={toast.tone === "success" ? "text-[#171717]" : "text-[#b91c1c]"}>
              {toast.tone === "success" ? <IconCheck /> : <IconClose />}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationComingSoon({
  title,
  subtitle,
  description,
  gradient,
}: {
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
}) {
  return (
    <article className="rounded-[14px] border border-black/10 bg-white p-6 opacity-60">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-[10px] bg-gradient-to-br ${gradient} text-white`}>
            <IconBrain />
          </div>
          <div>
            <p className="text-[18px] font-semibold leading-[28px] text-[#101828]">{title}</p>
            <p className="mt-1 text-[14px] text-[#6a7282]">{subtitle}</p>
          </div>
        </div>
        <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-[12px] font-medium text-[#4a5565]">Coming Soon</span>
      </div>
      <p className="text-[14px] leading-6 text-[#4a5565]">{description}</p>
    </article>
  );
}
