import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login, getUserAgent, getUserWorkspaces } from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";

const extractErrorMessage = (value: unknown): string => {
  if (!value) return "Unable to sign in. Please try again.";
  if (value instanceof Error) return extractErrorMessage(value.message);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "Unable to sign in. Please try again.";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && "detail" in parsed) {
          const detail = (parsed as Record<string, unknown>).detail;
          if (typeof detail === "string" && detail.trim().length > 0) {
            return detail;
          }
        }
      } catch {
        // fall through to returning trimmed string
      }
    }
    return trimmed;
  }
  if (typeof value === "object") {
    const detail = (value as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
  }
  return "Unable to sign in. Please try again.";
};

export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail || !password.trim()) {
        setError("Enter your email and password to continue.");
        setIsSubmitting(false);
        return;
      }

      const authResult = await login({ email: trimmedEmail, password });

      let workspaceId = authResult.workspace_id ?? null;
      let workspaceName = authResult.workspace_name ?? null;
      if (!workspaceId) {
        try {
          const list = await getUserWorkspaces(authResult.id);
          if (list.length > 0) {
            workspaceId = list[0].id;
            workspaceName = list[0].name;
          }
        } catch (err) {
          console.warn("Failed to load workspaces after login", err);
        }
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authResult));
        window.sessionStorage.setItem(USER_ID_KEY, authResult.id);
        if (workspaceId) window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
        if (workspaceName) window.sessionStorage.setItem(WORKSPACE_NAME_KEY, workspaceName);
      }

      try {
        const agent = await getUserAgent(authResult.id);
        if (agent) {
          const target = workspaceId ? `/dashboard?workspace=${workspaceId}` : "/dashboard";
          navigate(target, { replace: true });
          return;
        }
      } catch (err) {
        console.warn("No agent found after sign in", err);
      }

      navigate("/onboarding", {
        replace: true,
        state: { prefillEmail: authResult.email },
      });
    } catch (err) {
      console.error("Sign in failed", err);
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 rounded-[32px] bg-white p-10 shadow-2xl">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-500">Welcome back</p>
          <h1 className="text-3xl font-bold text-slate-900">Sign in to PM Assist</h1>
          <p className="text-sm text-slate-500">
            Access your personal AI Product Manager and pick up where you left off.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <label className="block text-sm font-medium text-slate-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block text-sm font-medium text-slate-600">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <footer className="text-center text-sm text-slate-500">
          New to PM Assist?{' '}
          <button
            type="button"
            onClick={() => navigate("/onboarding", { replace: true })}
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            Start onboarding
          </button>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => navigate("/forgot-password", { replace: true })}
              className="text-sm font-semibold text-slate-400 hover:text-blue-400"
            >
              Forgot password?
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
