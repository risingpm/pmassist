import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";

import AskWorkspaceDrawer from "./AskWorkspaceDrawer";
import useAgentName from "../hooks/useAgentName";
import { AI_COACH_OPEN_EVENT, USER_ID_KEY, WORKSPACE_ID_KEY } from "../constants";

type AICoachButtonProps = {
  workspaceId?: string | null;
  userId?: string | null;
};

const PROMPTS = ["Help me plan my next sprint", "Summarize this roadmap", "Generate a PRD draft from template"];

export default function AICoachButton({ workspaceId, userId }: AICoachButtonProps) {
  const agentName = useAgentName();
  const [open, setOpen] = useState(false);
  const resolvedWorkspaceId = useMemo(() => {
    if (workspaceId) return workspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [workspaceId]);
  const resolvedUserId = useMemo(() => {
    if (userId) return userId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, [userId]);

  useEffect(() => {
    const listener: EventListener = () => setOpen(true);
    window.addEventListener(AI_COACH_OPEN_EVENT, listener);
    return () => window.removeEventListener(AI_COACH_OPEN_EVENT, listener);
  }, []);

  const disabled = !resolvedWorkspaceId || !resolvedUserId;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 text-left text-sm font-semibold text-white shadow-2xl transition hover:from-slate-800 hover:to-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MessageCircle className="h-5 w-5" />
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-300">AI Coach</span>
          <span>Ask {agentName}</span>
        </div>
      </button>

      <AskWorkspaceDrawer
        workspaceId={resolvedWorkspaceId}
        userId={resolvedUserId}
        agentName={agentName}
        open={open}
        onOpenChange={setOpen}
        showTrigger={false}
        suggestions={PROMPTS}
      />
    </>
  );
}
