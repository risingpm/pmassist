import { useEffect } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";

import { WORKSPACE_ID_KEY } from "../constants";

export default function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();

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
    </div>
  );
}
