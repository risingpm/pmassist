import { useEffect } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router-dom";

import { WORKSPACE_ID_KEY } from "../constants";

export default function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!workspaceId) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
    }
  }, [workspaceId]);

  if (!workspaceId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
