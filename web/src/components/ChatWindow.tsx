import { useEffect, useRef } from "react";
import type { ChatMessage } from "../api";
import AgentAvatar from "./AgentAvatar";
import SafeMarkdown from "./SafeMarkdown";

type ChatWindowProps = {
  messages: ChatMessage[];
  isAssistantTyping?: boolean;
  onScrollBottom?: () => void;
};

const roleLabel: Record<ChatMessage["role"], string> = {
  assistant: "Atlas",
  user: "You",
};

export default function ChatWindow({ messages, isAssistantTyping = false, onScrollBottom }: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    onScrollBottom?.();
  }, [messages, isAssistantTyping, onScrollBottom]);

  return (
    <div className="flex-1 overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            <p className="text-center text-[11px] uppercase tracking-[0.35em] text-white/40">Today</p>
            {messages.length === 0 && <EmptyStateCard />}
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <article
                  key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
                  className={`flex gap-3 ${isUser ? "flex-row-reverse text-right" : ""}`}
                >
                  <div className="flex-shrink-0 pt-1">
                    {isUser ? (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white/90 ring-1 ring-white/40">
                        You
                      </div>
                    ) : (
                      <AgentAvatar size="sm" name="Atlas" />
                    )}
                  </div>
                  <div className={`flex w-full max-w-[90%] flex-col gap-2 ${isUser ? "items-end" : ""}`}>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.35em] ${isUser ? "text-white/50" : "text-white/60"}`}>
                      {roleLabel[message.role] ?? "Atlas"}
                    </div>
                    <div
                      className={`w-full rounded-[30px] border px-5 py-4 text-sm shadow-[0_18px_45px_rgba(15,23,42,0.35)] backdrop-blur-sm ${
                        isUser
                          ? "border-white/30 bg-gradient-to-br from-indigo-500/90 via-indigo-500/80 to-sky-500/80 text-white"
                          : "border-white/40 bg-white/95 text-slate-900"
                      }`}
                    >
                      <SafeMarkdown className={isUser ? "text-white/90 [&_strong]:text-white" : ""}>
                        {message.content}
                      </SafeMarkdown>
                    </div>
                  </div>
                </article>
              );
            })}
            {isAssistantTyping && (
              <div className="flex gap-3">
                <AgentAvatar size="sm" name="Atlas" className="animate-pulse" />
                <div className="flex-1 rounded-[28px] border border-white/25 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-2xl backdrop-blur">
                  Atlas is drafting a reply…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className="rounded-[40px] border border-white/10 bg-white/10 p-6 text-left text-sm text-white/80 shadow-inner backdrop-blur">
      <p className="text-base font-semibold text-white">What should we create together?</p>
      <p className="mt-2 text-sm text-white/70">
        Ask Atlas for product briefs, prototypes, or roadmap support. The assistant will ground answers in your workspace knowledge.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {[
          "Design a dual-pane dashboard for PM analytics",
          "Draft a platform roadmap for the next quarter",
          "Summarize customer research signals",
          "Create a 1-pager for the upcoming launch",
        ].map((idea) => (
          <div key={idea} className="rounded-3xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80 shadow hover:border-white/30">
            {idea}
          </div>
        ))}
      </div>
    </div>
  );
}
