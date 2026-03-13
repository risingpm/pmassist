import { useNavigate, useParams } from "react-router-dom";
import { WORKSPACE_ID_KEY } from "../constants";
import agentIcon from "../assets/dashboard/card-agent.svg";

export default function AgentsPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const resolvedWorkspaceId = workspaceId ??
    (typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_ID_KEY) : null);

  return (
    <div className="min-h-screen bg-white text-[#101828]">
      <header className="border-b border-[#e5e7eb] px-8 py-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-sm font-medium text-[#1f2937]"
            onClick={() => {
              if (resolvedWorkspaceId) {
                navigate(`/workspaces/${resolvedWorkspaceId}/home`);
                return;
              }
              navigate(-1);
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="rounded-[10px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              if (!resolvedWorkspaceId) return;
              navigate(`/workspaces/${resolvedWorkspaceId}/agents/new`);
            }}
          >
            New Agent
          </button>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f3e8ff]">
            <img alt="" className="h-5 w-5" src={agentIcon} />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold">AI Agents</h1>
            <p className="text-[13px] text-[#6a7282]">0 total agents</p>
          </div>
        </div>
      </header>

      <main className="px-8 py-12">
        <div className="mx-auto flex max-w-[720px] flex-col items-center rounded-[28px] border border-[#edeff5] bg-[#fbfcff] px-10 py-14 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#a855f7] to-[#2563eb] text-white">
            <img alt="" className="h-7 w-7" src={agentIcon} />
          </div>
          <h2 className="mt-6 text-[24px] font-semibold">Create your first agent</h2>
          <p className="mt-2 max-w-[520px] text-sm text-[#6a7282]">
            Build an AI agent to handle repeatable workflows. Define what it should do, configure tools,
            and keep context aligned with your workspace.
          </p>
          <button
            type="button"
            className="mt-6 rounded-[12px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-5 py-2 text-sm font-semibold text-white"
            onClick={() => {
              if (!resolvedWorkspaceId) return;
              navigate(`/workspaces/${resolvedWorkspaceId}/agents/new`);
            }}
          >
            Create agent
          </button>
          <p className="mt-4 text-xs text-[#98a2b3]">
            You can customize behavior, tools, and context once created.
          </p>
        </div>
      </main>
    </div>
  );
}
