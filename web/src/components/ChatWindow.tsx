import { useEffect, useRef } from "react";
import type { ChatMessage } from "../api";
import AgentAvatar from "./AgentAvatar";
import SafeMarkdown from "./SafeMarkdown";
import TypingIndicator from "./TypingIndicator";
import useAgentName from "../hooks/useAgentName";

type ChatWindowProps = {
  messages: ChatMessage[];
  isAssistantTyping?: boolean;
  onScrollBottom?: () => void;
};

export default function ChatWindow({ messages, isAssistantTyping = false, onScrollBottom }: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const agentName = useAgentName();
  const roleLabel: Record<ChatMessage["role"], string> = {
    assistant: agentName,
    user: "You",
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    onScrollBottom?.();
  }, [messages, isAssistantTyping, onScrollBottom]);

  useEffect(() => {
    if (!containerRef.current) return;
    const pres = containerRef.current.querySelectorAll("pre");
    pres.forEach((pre) => {
      if (pre.getAttribute("data-copy-button") === "true") return;
      pre.setAttribute("data-copy-button", "true");
      pre.classList.add("relative", "group");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.className =
        "copy-btn absolute right-3 top-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100";
      button.addEventListener("click", () => {
        navigator.clipboard.writeText(pre.innerText).catch(() => {
          /* ignore */
        });
        const original = button.textContent;
        button.textContent = "Copied";
        button.classList.add("text-emerald-600");
        setTimeout(() => {
          button.textContent = original || "Copy";
          button.classList.remove("text-emerald-600");
        }, 1500);
      });
      pre.appendChild(button);
    });
  }, [messages]);

  return (
    <div className="flex-1 overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" ref={containerRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            <p className="text-center text-[11px] uppercase tracking-[0.35em] text-white/40">Today</p>
            {messages.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                <p>No conversation yet. Ask {agentName} anything about this project to get started.</p>
              </div>
            )}
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
                      <AgentAvatar size="sm" name={agentName} />
                    )}
                  </div>
                  <div className={`flex w-full max-w-[90%] flex-col gap-2 ${isUser ? "items-end" : ""}`}>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.35em] ${isUser ? "text-white/50" : "text-white/60"}`}>
                      {roleLabel[message.role] ?? agentName}
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
                <AgentAvatar size="sm" name={agentName} className="animate-pulse" />
                <div className="flex-1 rounded-[28px] border border-white/25 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-2xl backdrop-blur">
                  <TypingIndicator label={agentName} />
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
