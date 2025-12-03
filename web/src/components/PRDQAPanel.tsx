import { useState } from "react";
import type { KnowledgeBaseContextItem, PRDQAResponse, VerificationDetails } from "../api";
import { askPrdQuestion } from "../api";

type PRDQAPanelProps = {
  projectId: string;
  prdId: string;
  workspaceId: string | null;
  activeVersion: number;
  className?: string;
};

const PROMPTS = [
  "Summarize this PRD",
  "Why did the scope change in this version?",
  "What decisions affect the metrics?",
];

export default function PRDQAPanel({ projectId, prdId, workspaceId, activeVersion, className }: PRDQAPanelProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<PRDQAResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const answer = await askPrdQuestion(projectId, workspaceId, {
        question: question.trim(),
        prd_id: prdId,
        version_a: activeVersion,
      });
      setResponse(answer);
      setQuestion("");
    } catch (err: any) {
      setError(err.message || "AI assistant unavailable");
    } finally {
      setLoading(false);
    }
  };

  const disabled = !workspaceId;
  const contextEntries: KnowledgeBaseContextItem[] = response?.context_entries ?? [];
  const verification: VerificationDetails | null = response?.verification ?? null;

  return (
    <aside className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-sm ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">AI Q&A</p>
      <h3 className="text-lg font-semibold text-slate-900">Ask about this PRD</h3>
      <p className="text-sm text-slate-500">
        Answers use embeddings from every version and decision note. Cite snippets inline with [CTX#].
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setQuestion(prompt)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={ask} className="mt-4 space-y-2">
        <textarea
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={disabled ? "Select a workspace to chat" : "Ask anything about this PRD"}
          disabled={disabled || loading}
          className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={disabled || loading || !question.trim()}
          className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {response && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            {response.answer}
          </div>
          {verification && (
            <p
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                verification.status === "passed"
                  ? "bg-emerald-50 text-emerald-700"
                  : verification.status === "failed"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {verification.message}
            </p>
          )}
          {contextEntries.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Context</p>
              <ul className="mt-2 space-y-2">
                {contextEntries.map((entry) => (
                  <li key={entry.id} className="rounded-xl bg-white p-2 text-xs text-slate-600 shadow-sm">
                    <p className="font-semibold text-slate-800">
                      [{entry.marker}] {entry.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{entry.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
