import { useMemo, useState } from "react";

import {
  askWorkspaceQuestion,
  type KnowledgeBaseContextItem,
  type VerificationDetails,
  type WorkspaceChatMessage,
  type WorkspaceChatTurn,
} from "../api";
import AgentAvatar from "./AgentAvatar";

type AskWorkspaceDrawerProps = {
  workspaceId: string | null;
  userId: string | null;
  agentName: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  suggestions?: string[];
};

export default function AskWorkspaceDrawer({
  workspaceId,
  userId,
  agentName,
  open,
  onOpenChange,
  showTrigger = true,
  suggestions,
}: AskWorkspaceDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const drawerOpen = isControlled ? (open as boolean) : internalOpen;
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WorkspaceChatMessage[]>([]);
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);
  const [verification, setVerification] = useState<VerificationDetails | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => agentName || "Workspace AI", [agentName]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !userId || !input.trim()) {
      setError("Select a workspace and enter a prompt.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response: WorkspaceChatTurn = await askWorkspaceQuestion({
        workspace_id: workspaceId,
        user_id: userId,
        question: input.trim(),
        session_id: sessionId ?? undefined,
      });
      setSessionId(response.session_id);
      setMessages(response.messages);
      setContextEntries(response.context_entries || []);
      setVerification(response.verification ?? null);
      setInput("");
    } catch (err: any) {
      setError(err.message || "Failed to ask your workspace.");
    } finally {
      setSending(false);
    }
  };

  const disabled = !workspaceId || !userId;
  const handleOpenChange = (value: boolean) => {
    if (!isControlled) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleOpenChange(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AgentAvatar name={title} />
          <span>Ask {title}</span>
        </button>
      )}

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ask My Workspace</p>
                <h3 className="text-lg font-semibold text-slate-900">Chat with {title}</h3>
              </div>
              <button
                onClick={() => handleOpenChange(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400">
                  Ask anything about your PRDs, roadmaps, knowledge base, or tasks and {title} will pull the relevant
                  context.
                </p>
              )}
              {suggestions && suggestions.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {suggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className="space-y-1">
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.3em] ${
                        message.role === "assistant" ? "text-blue-500" : "text-slate-400"
                      }`}
                    >
                      {message.role === "assistant" ? title : "You"}
                    </p>
                    <p className="rounded-2xl bg-slate-50 px-4 py-2 text-sm text-slate-700">{message.content}</p>
                  </div>
                ))}
              </div>
              {verification && (
                <div
                  className={`mt-4 rounded-2xl border px-3 py-2 text-xs ${
                    verification.status === "passed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : verification.status === "failed"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {verification.message}
                </div>
              )}
              {contextEntries.length > 0 && (
                <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold uppercase tracking-[0.3em] text-slate-400">Context Used</p>
                  <ul className="mt-2 space-y-2">
                    {contextEntries.map((entry) => (
                      <li key={entry.id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.type}</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.snippet}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-4">
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
              <form onSubmit={handleSend} className="flex flex-col gap-3">
                <textarea
                  rows={2}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={disabled ? "Select a workspace to chat" : "Ask about PRDs, tasks, metrics..."}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-inner focus:border-blue-500 focus:outline-none"
                />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{title} references the latest workspace context.</span>
                <button
                  type="submit"
                  disabled={sending || disabled || !input.trim()}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "Thinking..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
