import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
import { USER_ID_KEY, WORKSPACE_ID_KEY, WIDE_PAGE_CONTAINER } from "../../constants";
import { SECTION_LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON, BODY_SUBTLE } from "../../styles/theme";

export default function BuilderChatPage() {
  const navigate = useNavigate();
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId?: string }>();
  const workspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [routeWorkspaceId]);
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

  const navItems = useMemo(() => {
    if (!workspaceId) return [];
    return [
      { label: "Dashboard", path: `/workspaces/${workspaceId}/dashboard`, active: false },
      { label: "Projects", path: `/workspaces/${workspaceId}/projects`, active: false },
      { label: "Builder", path: `/workspaces/${workspaceId}/builder`, active: true },
      { label: "Prototypes", path: `/workspaces/${workspaceId}/prototypes`, active: false },
    ];
  }, [workspaceId]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-white/10 bg-transparent px-6 py-4">
        <div className={`${WIDE_PAGE_CONTAINER} space-y-4`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={`${SECTION_LABEL} text-white/60`}>Workspace builder</p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Builder Chat</h1>
              <p className={`${BODY_SUBTLE} text-white/70`}>
                Describe an idea conversationally and preview a live prototype instantly.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => navigate(-1)} className={SECONDARY_BUTTON}>
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!latestCode || saving}
                className={`${PRIMARY_BUTTON} bg-white/20 text-white hover:bg-white/30`}
              >
                {saving ? "Saving..." : "Save Prototype"}
              </button>
            </div>
          </div>
          {navItems.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`rounded-full px-4 py-2 ${
                    item.active ? "bg-white text-slate-900 shadow-sm" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {error && (
        <div className={`${WIDE_PAGE_CONTAINER} mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-6 py-3 text-sm text-rose-100`}>
          {error}
        </div>
      )}
      <main className={`${WIDE_PAGE_CONTAINER} flex w-full flex-col gap-6 py-8 lg:flex-row`}>
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
      <section className={`${WIDE_PAGE_CONTAINER} w-full pb-10`}>
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
