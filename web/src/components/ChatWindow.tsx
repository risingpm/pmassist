import type { ChatMessage } from "../api";
import { useEffect, useRef } from "react";

type ChatWindowProps = {
  messages: ChatMessage[];
  isAssistantTyping?: boolean;
  onScrollBottom?: () => void;
};

export default function ChatWindow({ messages, isAssistantTyping = false, onScrollBottom }: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
    if (onScrollBottom) {
      onScrollBottom();
    }
  }, [messages, isAssistantTyping, onScrollBottom]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Start the conversation with a roadmap prompt. The assistant will guide you through each phase.
          </div>
        )}
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div
              key={`${message.role}-${index}-${message.content.slice(0, 8)}`}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  isUser
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-800 ring-1 ring-slate-100"
                }`}
              >
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            </div>
          );
        })}
        {isAssistantTyping && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-3xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
              PM Assist is thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
