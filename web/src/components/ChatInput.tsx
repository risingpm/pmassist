import { useState } from "react";

type ChatInputProps = {
  onSend: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
};

export default function ChatInput({ onSend, disabled = false, placeholder, suggestions = [] }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const handleSuggestion = (text: string) => {
    if (disabled) return;
    setValue(text);
  };

  return (
    <div className="border-t border-white/10 bg-gradient-to-b from-transparent via-white/5 to-white/10 px-4 py-6">
      {suggestions.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {suggestions.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestion(suggestion)}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/20"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="group rounded-[36px] border border-white/15 bg-white/90 p-5 shadow-[0_30px_60px_rgba(15,23,42,0.35)] backdrop-blur transition focus-within:border-indigo-200 focus-within:shadow-indigo-500/30"
      >
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder || "Describe the roadmap you need help with..."}
          rows={4}
          disabled={disabled}
          className="min-h-[112px] w-full resize-none border-0 bg-transparent text-base text-slate-900 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Shift + Enter for newline</span>
          <div className="flex flex-1 items-center justify-end gap-3">
            <button
              type="submit"
              disabled={disabled || !value.trim()}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
