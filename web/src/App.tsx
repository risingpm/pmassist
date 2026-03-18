import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import OnboardingPage from "./pages/Onboarding";
import ProjectsPage from "./pages/ProjectsPage";
import WorkspaceLanding from "./pages/WorkspaceLanding";
import NewPrd from "./pages/NewPrd";
import NewProject from "./pages/NewProject";
import PrdsPage from "./pages/PrdsPage";
import RoadmapsPage from "./pages/RoadmapsPage";
import RoadmapBuilder from "./pages/RoadmapBuilder";
import AgentsPage from "./pages/AgentsPage";
import SignInPage from "./pages/SignIn";
import ForgotPasswordPage from "./pages/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPassword";
import WorkspaceLayout from "./pages/WorkspaceLayout";
import { AUTH_USER_KEY, WORKSPACE_ID_KEY } from "./constants";
import { RoleProvider } from "./context/RoleContext";
import LandingPage from "./pages/LandingPage";
import IntegrationsPage from "./pages/Integrations";
import TaskBoardBuilder from "./pages/TaskBoardBuilder";
import TaskBoardsPage from "./pages/TaskBoardsPage";
import AIChatPage from "./pages/AIChatPage";
import SubscriptionPage from "./pages/SubscriptionPage";

function RootRoute() {
  const navigate = useNavigate();
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setShowLanding(true);
      return;
    }

    const hasUser = Boolean(window.sessionStorage.getItem(AUTH_USER_KEY));

    if (hasUser) {
      const storedWorkspace = window.sessionStorage.getItem(WORKSPACE_ID_KEY);
      if (storedWorkspace) {
        navigate(`/workspaces/${storedWorkspace}/home`, { replace: true });
        return;
      }
      navigate("/onboarding", { replace: true });
    } else {
      setShowLanding(true);
    }
  }, [navigate]);

  if (showLanding) {
    return <LandingPage />;
  }

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
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const page =
      path === "/" ? "Home" :
      path.startsWith("/signin") ? "Sign In" :
      path.startsWith("/forgot-password") ? "Forgot Password" :
      path.startsWith("/reset-password") ? "Reset Password" :
      path.startsWith("/onboarding") ? "Onboarding" :
      path.includes("/home") ? "Workspace" :
      path.includes("/projects") ? "Projects" :
      path.includes("/prds") || path.includes("/prd/") ? "PRDs" :
      path.includes("/roadmaps") ? "Roadmaps" :
      path.includes("/tasks") ? "Task Boards" :
      path.includes("/ai-chat") ? "AI Chat" :
      path.includes("/integrations") ? "Integrations" :
      path.includes("/agents") ? "AI Agents" :
      "Workspace";
    document.title = `${page} | 8product.com`;
  }, [location.pathname]);

  return (
    <RoleProvider>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<WorkspaceRouteRedirect segment="home" />} />
        <Route path="/projects" element={<WorkspaceRouteRedirect segment="projects" />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<WorkspaceLanding />} />
          <Route path="prds" element={<PrdsPage />} />
          <Route path="roadmaps" element={<RoadmapsPage />} />
          <Route path="roadmaps/new" element={<RoadmapBuilder />} />
          <Route path="roadmaps/:projectId" element={<RoadmapBuilder />} />
          <Route path="prd/new" element={<NewPrd />} />
          <Route path="prd/:prdId" element={<NewPrd />} />
          <Route path="dashboard" element={<Navigate to="../home" replace />} />
          <Route path="insights" element={<Navigate to="../home" replace />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<NewProject />} />
          <Route path="projects/edit/:projectId" element={<NewProject />} />
          <Route path="projects/members" element={<ProjectsPage />} />
          <Route path="projects/detail/:projectId" element={<ProjectsPage />} />
          <Route path="projects/detail/:projectId/:tab" element={<ProjectsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="ai-chat" element={<AIChatPage />} />
          <Route path="tasks" element={<TaskBoardsPage />} />
          <Route path="tasks/new" element={<TaskBoardBuilder />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RoleProvider>
  );
}
