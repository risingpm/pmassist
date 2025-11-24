import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ChatWindow from "../../components/ChatWindow";
import ChatInput from "../../components/ChatInput";
import PrototypePreview from "../../components/PrototypePreview";
import ContextUsedPanel from "../../components/ContextUsedPanel";
import PrototypeCard from "../../components/PrototypeCard";
import {
  builderChat,
  builderPreview,
  builderSavePrototype,
  listBuilderPrototypes,
  type BuilderPrototypeRecord,
  type ChatMessage,
  type KnowledgeBaseContextItem,
} from "../../api";
import { designTokens } from "../../theme/designTokens";
import { USER_ID_KEY, WORKSPACE_ID_KEY } from "../../constants";

export default function BuilderChatPage() {
  const navigate = useNavigate();
  const workspaceId = typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_ID_KEY) : null;
  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) : null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contextEntries, setContextEntries] = useState<KnowledgeBaseContextItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [latestCode, setLatestCode] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prototypes, setPrototypes] = useState<BuilderPrototypeRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const loadPrototypes = useCallback(async () => {
    if (!workspaceId || !userId) return;
    try {
      const list = await listBuilderPrototypes(workspaceId, userId);
      setPrototypes(list);
    } catch (err: any) {
      console.warn("Failed to load prototypes", err);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    loadPrototypes();
  }, [loadPrototypes]);

  const handleSend = async (prompt: string) => {
    if (!workspaceId || !userId) {
      setError("Workspace context missing.");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setError(null);
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await builderChat({
        workspace_id: workspaceId,
        user_id: userId,
        prompt: trimmed,
        history: messages,
      });
      const assistantMessage: ChatMessage = { role: "assistant", content: response.message };
      setMessages((prev) => [...prev, assistantMessage]);
      setContextEntries(response.context_entries ?? []);
      setSuggestions(response.suggestions ?? []);
      setLatestCode(response.code);

      const preview = await builderPreview(response.code);
      setPreviewHtml(preview.preview_html);
    } catch (err: any) {
      setError(err.message || "Builder chat failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workspaceId || !userId || !latestCode || !previewHtml) {
      setError("Generate a prototype before saving.");
      return;
    }
    setSaving(true);
    try {
      await builderSavePrototype({
        workspace_id: workspaceId,
        user_id: userId,
        title: `Prototype ${new Date().toLocaleString()}`,
        prompt: messages.filter((msg) => msg.role === "user").slice(-1)[0]?.content ?? "",
        code: latestCode,
        preview_html: previewHtml,
        design_tokens: designTokens,
      });
      await loadPrototypes();
    } catch (err: any) {
      setError(err.message || "Failed to save prototype.");
    } finally {
      setSaving(false);
    }
  };

  const currentPrompt = useMemo(() => {
    const entries = messages.filter((msg) => msg.role === "user");
    return entries.length > 0 ? entries[entries.length - 1].content : "";
  }, [messages]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-white/10 bg-transparent px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm font-semibold text-white/70 transition hover:text-white"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-semibold tracking-tight">Builder Chat</h1>
            <p className="text-sm text-white/60">Describe an idea conversationally and preview a live prototype instantly.</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!latestCode || saving}
            className="rounded-full bg-white/20 px-6 py-2 text-sm font-semibold text-white transition hover:bg-white/30 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Prototype"}
          </button>
        </div>
      </header>
      {error && (
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-rose-400/30 bg-rose-500/10 px-6 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <section className="flex flex-1 flex-col rounded-3xl border border-white/10 bg-white/5 shadow-lg backdrop-blur">
          <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.4em] text-white/40">
            Builder Chat
          </div>
          <ChatWindow messages={messages} isAssistantTyping={loading} />
          <ChatInput
            onSend={handleSend}
            disabled={loading}
            suggestions={suggestions.length > 0 ? suggestions : undefined}
            placeholder="e.g. Build a two-pane dashboard with analytics cards and a roadmap timeline"
          />
        </section>
        <section className="w-full space-y-4 lg:w-[420px]">
          <PrototypePreview html={previewHtml} isLoading={loading && !previewHtml} />
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-inner backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Primary prompt</p>
            <p className="mt-2 text-sm text-white/80">{currentPrompt || "No prompt yet."}</p>
          </div>
          <ContextUsedPanel entries={contextEntries} />
        </section>
      </main>
      <section className="mx-auto w-full max-w-6xl px-6 pb-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Saved prototypes</h2>
        </div>
        {prototypes.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">Nothing saved yet. Generate a prototype and hit “Save”.</p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {prototypes.map((prototype) => (
              <PrototypeCard key={prototype.id} prototype={prototype} onSelect={() => setPreviewHtml(prototype.preview_html ?? null)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
