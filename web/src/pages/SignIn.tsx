import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from "@react-oauth/google";

import { loginWithGoogle, getUserAgent, getUserWorkspaces, type AuthResponse } from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY, DEFAULT_AGENT_NAME } from "../constants";
import { setStoredAgentProfile } from "../utils/agentProfile";

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
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistSession = (authResult: AuthResponse, workspaceId: string | null, workspaceName: string | null) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(authResult));
      window.sessionStorage.setItem(USER_ID_KEY, authResult.id);
      if (workspaceId) window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
      if (workspaceName) window.sessionStorage.setItem(WORKSPACE_NAME_KEY, workspaceName);
    }
  };

  const completeSignIn = async (authResult: AuthResponse) => {
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
        console.warn("Failed to load workspaces after Google sign-in", err);
      }
    }

    persistSession(authResult, workspaceId, workspaceName);

    try {
      const agent = await getUserAgent(authResult.id);
      if (agent) {
        setStoredAgentProfile({ name: agent.name || DEFAULT_AGENT_NAME });
        const target = workspaceId ? `/dashboard?workspace=${workspaceId}` : "/dashboard";
        navigate(target, { replace: true });
        return;
      }
      setStoredAgentProfile(null);
    } catch (err) {
      console.warn("No agent found after sign in", err);
      setStoredAgentProfile(null);
    }

    navigate("/onboarding", {
      replace: true,
    });
  };

  const handleGoogleCredential = async (credential: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const authResult = await loginWithGoogle(credential);
      await completeSignIn(authResult);
    } catch (err) {
      console.error("Google sign in failed", err);
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google did not return a credential. Please try again.");
      return;
    }
    await handleGoogleCredential(response.credential);
  };

  const handleGoogleError = () => {
    setError("Unable to sign in with Google. Please try again.");
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

        <div className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {googleClientId ? (
            <GoogleOAuthProvider clientId={googleClientId}>
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap
                  theme="filled_black"
                  text="signin_with"
                />
              </div>
            </GoogleOAuthProvider>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> in your environment.
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/onboarding", { replace: true })}
            className="mx-auto inline-flex items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Back to onboarding"}
          </button>
        </div>
      </div>
    </div>
  );
}
