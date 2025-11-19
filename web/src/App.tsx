import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import OnboardingPage from "./pages/Onboarding";
import ProjectsPage from "./pages/ProjectsPage";
import SignInPage from "./pages/SignIn";
import ForgotPasswordPage from "./pages/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPassword";
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
      const target = storedWorkspace ? `/dashboard?workspace=${storedWorkspace}` : "/dashboard";
      navigate(target, { replace: true });
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

export default function App() {
  return (
    <RoleProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<ProjectsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RoleProvider>
  );
}
