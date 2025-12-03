import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import OnboardingPage from "./pages/Onboarding";
import ProjectsPage from "./pages/ProjectsPage";
import WorkspaceDashboard from "./pages/Dashboard";
import WorkspaceHome from "./pages/WorkspaceHome";
import BuilderChatPage from "./pages/BuilderChat";
import PrototypesPage from "./pages/Prototypes";
import SettingsPage from "./pages/Settings";
import TemplateLibraryPage from "./pages/Templates";
import WorkspaceKnowledgePage from "./pages/WorkspaceKnowledge";
import SignInPage from "./pages/SignIn";
import ForgotPasswordPage from "./pages/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPassword";
import WorkspaceLayout from "./pages/WorkspaceLayout";
import { AUTH_USER_KEY, WORKSPACE_ID_KEY } from "./constants";
import { RoleProvider } from "./context/RoleContext";

function RootRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") {
      navigate("/onboarding", { replace: true });
      return;
    }

    const hasUser = Boolean(window.sessionStorage.getItem(AUTH_USER_KEY));

    if (hasUser) {
      const storedWorkspace = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
      if (storedWorkspace) {
        navigate(`/workspaces/${storedWorkspace}/dashboard`, { replace: true });
        return;
      }
      navigate("/onboarding", { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <span className="animate-pulse text-xs uppercase tracking-[0.25em]">
        Loading
      </span>
    </div>
  );
}

function WorkspaceRouteRedirect({ segment }: { segment: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") {
      navigate("/onboarding", { replace: true });
      return;
    }
    const storedWorkspace = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
    if (storedWorkspace) {
      navigate(`/workspaces/${storedWorkspace}/${segment}`, { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
  }, [navigate, segment]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <span className="animate-pulse text-xs uppercase tracking-[0.25em]">Redirecting</span>
    </div>
  );
}

export default function App() {
  return (
    <RoleProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<WorkspaceRouteRedirect segment="dashboard" />} />
        <Route path="/projects" element={<WorkspaceRouteRedirect segment="projects" />} />
        <Route path="/builder" element={<WorkspaceRouteRedirect segment="builder" />} />
        <Route path="/prototypes" element={<WorkspaceRouteRedirect segment="prototypes" />} />
        <Route path="/templates" element={<WorkspaceRouteRedirect segment="templates" />} />
        <Route path="/settings" element={<WorkspaceRouteRedirect segment="settings" />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<WorkspaceHome />} />
          <Route path="insights" element={<WorkspaceDashboard />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="knowledge" element={<WorkspaceKnowledgePage />} />
          <Route path="projects/knowledge" element={<WorkspaceKnowledgePage />} />
          <Route path="projects/members" element={<ProjectsPage />} />
          <Route path="projects/detail/:projectId" element={<ProjectsPage />} />
          <Route path="projects/detail/:projectId/:tab" element={<ProjectsPage />} />
          <Route path="builder" element={<BuilderChatPage />} />
          <Route path="prototypes" element={<PrototypesPage />} />
          <Route path="templates" element={<TemplateLibraryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RoleProvider>
  );
}
