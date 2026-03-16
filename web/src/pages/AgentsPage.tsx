import { useNavigate, useParams } from "react-router-dom";
import { WORKSPACE_ID_KEY } from "../constants";

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
        </div>
        <div className="mt-6">
          <h1 className="text-[20px] font-semibold">AI Agents</h1>
        </div>
      </header>

      <main className="px-8 py-16">
        <p className="text-center text-[24px] font-semibold text-[#6a7282]">Coming soon</p>
      </main>
    </div>
  );
}
