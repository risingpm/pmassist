import { useEffect, useMemo } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";

import { USER_ID_KEY, WORKSPACE_ID_KEY } from "../constants";
import AICoachButton from "../components/AICoachButton";

export default function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
    }
  }, [workspaceId]);

  if (!workspaceId) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="min-h-screen">
        <Outlet />
      </div>
      <AICoachButton workspaceId={workspaceId} userId={userId} />
    </div>
  );
}
