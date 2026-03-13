import React, { useEffect, useState } from "react";
import type { MCPConnection, MCPConnectionPayload } from "../api";

type McpConnectionModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: MCPConnectionPayload & { clear_auth_token?: boolean }, connectionId?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  initialData: MCPConnection | null;
};

type FormState = {
  name: string;
  description: string;
  endpointUrl: string;
  toolName: string;
  promptField: string;
  contextField: string;
  defaultArguments: string;
  authToken: string;
  clearToken: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  endpointUrl: "",
  toolName: "",
  promptField: "prompt",
  contextField: "context",
  defaultArguments: "",
  authToken: "",
  clearToken: false,
};

export default function McpConnectionModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
  initialData,
}: McpConnectionModalProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description ?? "",
        endpointUrl: initialData.endpoint_url,
        toolName: initialData.tool_name,
        promptField: initialData.prompt_field,
        contextField: initialData.context_field ?? "context",
        defaultArguments: JSON.stringify(initialData.default_arguments ?? {}, null, 2),
        authToken: "",
        clearToken: false,
      });
    } else if (open) {
      setForm(DEFAULT_FORM);
    }
  }, [initialData, open]);

  const handleFieldChange = (field: keyof FormState, value: string | boolean) => {
    setLocalError(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    let parsedArgs: Record<string, unknown> | undefined;
    if (form.defaultArguments.trim()) {
      try {
        parsedArgs = JSON.parse(form.defaultArguments);
      } catch {
        setLocalError("Default arguments must be valid JSON.");
        return;
      }
    }

    const payload: MCPConnectionPayload & { clear_auth_token?: boolean } = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      endpoint_url: form.endpointUrl.trim(),
      tool_name: form.toolName.trim(),
      prompt_field: form.promptField.trim() || "prompt",
      context_field: form.contextField.trim() || undefined,
      default_arguments: parsedArgs ?? {},
    };
    if (form.authToken.trim()) {
      payload.auth_token = form.authToken.trim();
    }
    if (initialData && form.clearToken) {
      payload.clear_auth_token = true;
    }

    await onSubmit(payload, initialData?.id);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {initialData ? "Edit MCP connection" : "New MCP connection"}
            </h3>
            <p className="text-xs text-slate-500">
              Provide the MCP endpoint details and the tool you want this agent to call.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-900"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700">
            Display name
            <input
              required
              value={form.name}
              onChange={(event) => handleFieldChange("name", event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            MCP endpoint URL
            <input
              required
              value={form.endpointUrl}
              onChange={(event) => handleFieldChange("endpointUrl", event.target.value)}
              placeholder="https://example.com/mcp"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Tool name
            <input
              required
              value={form.toolName}
              onChange={(event) => handleFieldChange("toolName", event.target.value)}
              placeholder="fetch_third_party_data"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Prompt field
              <input
                value={form.promptField}
                onChange={(event) => handleFieldChange("promptField", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Context field
              <input
                value={form.contextField}
                onChange={(event) => handleFieldChange("contextField", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Default arguments (JSON)
            <textarea
              value={form.defaultArguments}
              onChange={(event) => handleFieldChange("defaultArguments", event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            API token (optional)
            <input
              value={form.authToken}
              onChange={(event) => handleFieldChange("authToken", event.target.value)}
              placeholder={initialData?.has_token ? "Token already set – enter to rotate" : "Bearer token"}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {initialData?.has_token && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.clearToken}
                onChange={(event) => handleFieldChange("clearToken", event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Remove saved token
            </label>
          )}
          <label className="block text-sm font-semibold text-slate-700">
            Description
            <textarea
              value={form.description}
              onChange={(event) => handleFieldChange("description", event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {(localError || error) && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-600">
              {localError || error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Saving..." : initialData ? "Save changes" : "Create connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
