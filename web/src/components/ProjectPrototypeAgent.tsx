import React, { useMemo, useState } from "react";
import {
  API_BASE,
  type PrototypeSession,
  type PrototypeAgentMessage,
} from "../api";

function renderMessage(message: PrototypeAgentMessage) {
  const isAssistant = message.role === "assistant";
  return (
    <div
      key={message.id}
      className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
        isAssistant ? "bg-blue-50 text-blue-900" : "bg-white border border-slate-200 text-slate-800"
      }`}
    >
      <p className="whitespace-pre-line leading-relaxed">{message.content}</p>
      <p className="mt-2 text-xs text-slate-400">
        {isAssistant ? "Assistant" : "You"} · {new Date(message.created_at).toLocaleString()}
      </p>
    </div>
  );
}

type ProjectPrototypeAgentProps = {
  session: PrototypeSession | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  onStart: (prompt: string) => Promise<void>;
  onSend: (message: string) => Promise<void>;
};

export default function ProjectPrototypeAgent({ session, loading, sending, error, onStart, onSend }: ProjectPrototypeAgentProps) {
  const [draft, setDraft] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const fallbackActive = (() => {
    const metadata = session?.latest_spec?.metadata as Record<string, unknown> | null | undefined;
    if (!metadata || typeof metadata !== "object") return false;
    const fallbackFlag = (metadata as { fallback?: unknown }).fallback;
    return fallbackFlag === true;
  })();

  const assistantMetrics = (() => {
    const metadata = session?.latest_spec?.metadata as Record<string, unknown> | null | undefined;
    if (!metadata || typeof metadata !== "object") return [];
    const metrics = metadata.assistant_metrics;
    return Array.isArray(metrics) ? (metrics as string[]) : [];
  })();

  const sortedMessages = useMemo(() => {
    if (!session) return [];
    return [...session.messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [session]);

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    setStartError(null);
    try {
      await onStart(initialPrompt.trim());
      setInitialPrompt("");
    } catch (err) {
      console.error("Failed to start prototype session", err);
      setStartError(err instanceof Error ? err.message : "Unable to start session");
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      setSendError("Share a thought or directive for the agent.");
      return;
    }
    setSendError(null);
    try {
      await onSend(content);
      setDraft("");
    } catch (err) {
      console.error("Failed to send message", err);
      setSendError(err instanceof Error ? err.message : "Unable to send message");
    }
  };

  if (!session) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Prototype Agent</h2>
        <p className="mt-1 text-sm text-slate-500">
          Chat with an AI product manager to iteratively build your prototype. Provide a starting brief to kick off the session.
        </p>
        <form onSubmit={handleStart} className="mt-4 space-y-3">
          <textarea
            value={initialPrompt}
            onChange={(event) => setInitialPrompt(event.target.value)}
            rows={4}
            placeholder="Describe what you want the prototype to explore..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {startError && <p className="text-sm text-rose-500">{startError}</p>}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Starting…" : "Start conversation"}
          </button>
        </form>
      </div>
    );
  }

  const resolvedBundleUrl = session.bundle_url
    ? session.bundle_url.startsWith("http")
      ? session.bundle_url
      : `${API_BASE.replace(/\/$/, "")}/${session.bundle_url.replace(/^\/+/, "")}`
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Prototype Agent</h2>
          {resolvedBundleUrl && (
            <a
              href={resolvedBundleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-blue-700"
            >
              Launch latest build
            </a>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Refine your prototype iteratively—each message updates the design and regenerates a live bundle.
        </p>
        {fallbackActive && (
          <p className="mt-2 text-xs font-medium text-amber-600">
            We’re using the local blueprint while the design model is unavailable; your instructions still shape each refresh.
          </p>
        )}
        {assistantMetrics.length > 0 && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Latest metrics captured</p>
            <ul className="mt-2 space-y-1">
              {assistantMetrics.map((metric) => (
                <li key={metric} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span>{metric}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid gap-3">
          {sortedMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet. Share a prompt below to begin.</p>
          ) : (
            sortedMessages.map((message) => renderMessage(message))
          )}
        </div>

        <form onSubmit={handleSend} className="mt-4 space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder="Ask for refinements, new flows, or adjustments…"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {sendError && <p className="text-sm text-rose-500">{sendError}</p>}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sending}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              {sending ? "Thinking…" : "Send"}
            </button>
            <p className="text-xs text-slate-400">
              The agent considers project details, knowledge base, roadmap, PRDs, and links on every iteration.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
