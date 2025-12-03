import { useEffect, useState, type ChangeEvent } from "react";

import AgentAvatar from "./AgentAvatar";
import useAgentName from "../hooks/useAgentName";
import {
  deleteWorkspaceAIProvider,
  getWorkspaceAIProviderStatus,
  saveWorkspaceAIProvider,
  testWorkspaceAIProvider,
  type WorkspaceAIProviderStatus,
} from "../api";

type Props = {
  workspaceId: string | null;
  workspaceName: string | null;
  userId: string | null;
  canAdminWorkspace: boolean;
};

const emptyForm = {
  api_key: "",
  organization: "",
  project: "",
};

export default function WorkspaceAIProviderCard({
  workspaceId,
  workspaceName,
  userId,
  canAdminWorkspace,
}: Props) {
  const agentName = useAgentName();
  const [status, setStatus] = useState<WorkspaceAIProviderStatus | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingSaved, setTestingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canConfigure = Boolean(workspaceId && userId && canAdminWorkspace);

  useEffect(() => {
    if (!workspaceId || !userId) {
      setStatus(null);
      setIsReplacing(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWorkspaceAIProviderStatus(workspaceId, userId)
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          if (!data.has_api_key) {
            setIsReplacing(true);
          } else {
            setIsReplacing(false);
          }
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.message || "Failed to load AI provider status.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  const handleInputChange = (field: keyof typeof emptyForm) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const requireContext = () => {
    if (!workspaceId || !userId) {
      setError("Select a workspace to manage AI credentials.");
      return false;
    }
    return true;
  };

  const handleTest = async () => {
    if (!canConfigure || !requireContext()) return;
    const apiKey = form.api_key.trim();
    if (!apiKey) {
      setError(status?.has_api_key ? "Enter a key or use Test saved key to verify the stored credentials." : "Enter an OpenAI API key before testing.");
      return;
    }
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      await testWorkspaceAIProvider(workspaceId!, {
        api_key: apiKey,
        organization: form.organization.trim() || undefined,
        project: form.project.trim() || undefined,
        user_id: userId!,
      });
      setMessage("API key verified successfully.");
    } catch (err: any) {
      setError(err.message || "Unable to verify OpenAI credentials.");
    } finally {
      setTesting(false);
    }
  };

  const handleTestSaved = async () => {
    if (!canConfigure || !requireContext()) return;
    if (!status?.has_api_key) {
      setError("No saved OpenAI key to test.");
      return;
    }
    setTestingSaved(true);
    setMessage(null);
    setError(null);
    try {
      await testWorkspaceAIProvider(workspaceId!, {
        use_saved_key: true,
        user_id: userId!,
      });
      setMessage("Saved OpenAI key verified successfully.");
    } catch (err: any) {
      setError(err.message || "Unable to verify the saved OpenAI key.");
    } finally {
      setTestingSaved(false);
    }
  };

  const handleSave = async () => {
    if (!canConfigure || !requireContext()) return;
    const apiKey = form.api_key.trim();
    if (!apiKey) {
      setError("Enter an OpenAI API key to save.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await saveWorkspaceAIProvider(workspaceId!, {
        api_key: apiKey,
        organization: form.organization.trim() || undefined,
        project: form.project.trim() || undefined,
        user_id: userId!,
      });
      setStatus(response);
      setForm(emptyForm);
      setIsReplacing(false);
      setMessage("Custom OpenAI key saved for this workspace.");
    } catch (err: any) {
      setError(err.message || "Unable to save AI credentials.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!canConfigure || !requireContext() || !status?.has_api_key) return;
    setRemoving(true);
    setMessage(null);
    setError(null);
    try {
      await deleteWorkspaceAIProvider(workspaceId!, userId!);
      setStatus({
        provider: "openai",
        is_enabled: false,
        has_api_key: false,
        masked_key_preview: null,
        key_suffix: null,
      });
      setIsReplacing(true);
      setMessage("Workspace reverted to the default OpenAI key.");
    } catch (err: any) {
      setError(err.message || "Unable to remove the saved key.");
    } finally {
      setRemoving(false);
    }
  };

  const pillarLabel = status?.has_api_key ? "Custom key active" : "Using default key";
  const pillarStyle = status?.has_api_key
    ? "bg-emerald-50 text-emerald-700"
    : "bg-slate-100 text-slate-500";

  return (
    <section className="mt-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AgentAvatar size="sm" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">AI Provider</p>
              <h3 className="text-xl font-semibold text-slate-900">
                {agentName}&rsquo;s OpenAI access
              </h3>
              <p className="text-sm text-slate-500">
                Connect your own OpenAI API key so {agentName} powers every workspace inside{" "}
                {workspaceName ?? "this tenant"} with your limits.
              </p>
              {status?.updated_at && (
                <p className="text-xs text-slate-400">
                  Updated {new Date(status.updated_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${pillarStyle}`}>
            {pillarLabel}
          </span>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Loading AI provider status...
          </div>
        ) : canAdminWorkspace ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                OpenAI API key
                <input
                  type="password"
                  value={form.api_key}
                  onChange={handleInputChange("api_key")}
                  placeholder="sk-live-..."
                  disabled={!canConfigure || saving || (status?.has_api_key && !isReplacing)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              <p className="mt-1 text-xs text-slate-400">
                {status?.has_api_key && status.key_suffix && !isReplacing ? (
                  <>
                    Saved key ends with{" "}
                    <span className="font-semibold text-slate-600">{status.key_suffix}</span>. Use “Test saved key”
                    to verify it anytime.
                  </>
                ) : (
                  "We never display saved keys. Paste a new key whenever you need to rotate it."
                )}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Organization (optional)
                <input
                  type="text"
                  value={form.organization}
                  onChange={handleInputChange("organization")}
                  placeholder="org-..."
                  disabled={!canConfigure || saving || (status?.has_api_key && !isReplacing)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Project (optional)
                <input
                  type="text"
                  value={form.project}
                  onChange={handleInputChange("project")}
                  placeholder="proj_..."
                  disabled={!canConfigure || saving || (status?.has_api_key && !isReplacing)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              {(!status?.has_api_key || isReplacing) && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!canConfigure || testing}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {testing ? "Testing..." : "Test connection"}
                </button>
              )}
              {status?.has_api_key && !isReplacing && (
                <button
                  type="button"
                  onClick={handleTestSaved}
                  disabled={!canConfigure || testingSaved}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {testingSaved ? "Testing saved key..." : "Test saved key"}
                </button>
              )}
              {(status?.has_api_key && !isReplacing && canConfigure) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReplacing(true);
                    setForm(emptyForm);
                    setMessage(null);
                    setError(null);
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Replace key
                </button>
              )}
              {(!status?.has_api_key || isReplacing) && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canConfigure || saving}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save key"}
                </button>
              )}
              {status?.has_api_key && !isReplacing && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={!canConfigure || removing}
                  className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {removing ? "Removing..." : "Remove custom key"}
                </button>
              )}
              {isReplacing && status?.has_api_key && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReplacing(false);
                    setForm(emptyForm);
                    setMessage(null);
                    setError(null);
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            You have viewer access. Ask a workspace admin to configure the tenant-wide OpenAI credentials for {agentName}.
          </div>
        )}
      </div>
    </section>
  );
}
