import { useState } from "react";
import { askStrategist } from "../../api";
import AgentAvatar from "../AgentAvatar";
import useAgentName from "../../hooks/useAgentName";

interface AskStrategistChatProps {
  workspaceId: string | null;
  projectId: string;
  userId: string | null;
}

export default function AskStrategistChat({ workspaceId, projectId, userId }: AskStrategistChatProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentName = useAgentName();

  const handleAsk = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !userId || !question.trim()) {
      setError("Select a workspace and enter a question.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await askStrategist({ workspace_id: workspaceId, project_id: projectId, user_id: userId, question: question.trim() });
      setAnswer(response.answer);
      setQuestion("");
    } catch (err: any) {
      setError(err.message || "Strategist is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Ask Strategist</p>
          <h3 className="text-lg font-semibold text-slate-900">Chat with {agentName}</h3>
        </div>
        <AgentAvatar name={agentName} size="sm" />
      </div>
      {answer && <p className="mt-4 text-sm text-slate-600">{answer}</p>}
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      <form onSubmit={handleAsk} className="mt-4 flex flex-col gap-3">
        <textarea
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about priorities, risks, or outcomes..."
          className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setQuestion("");
              setAnswer(null);
            }}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
