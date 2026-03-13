type TypingIndicatorProps = {
  label?: string;
  text?: string;
  className?: string;
};

export default function TypingIndicator({ label, text, className }: TypingIndicatorProps) {
  const contentText = text ?? (label ? "is thinking" : "Thinking");

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {label && <span className="font-semibold text-slate-700">{label}</span>}
      <span>{contentText}</span>
      <span className="chat-typing-dots" aria-hidden="true">
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot" />
        <span className="chat-typing-dot" />
      </span>
    </div>
  );
}
