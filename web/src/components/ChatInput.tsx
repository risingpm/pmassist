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
    <div className="border-t border-slate-200 bg-white px-4 py-4">
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestion(suggestion)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder || "Describe the roadmap you need help with..."}
          rows={3}
          disabled={disabled}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>Shift + Enter for newline</span>
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
