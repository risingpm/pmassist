import { useState } from "react";
import { forgotPassword } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{ token: string; expires_at: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const result = await forgotPassword(email.trim().toLowerCase());
      setResponse({ token: result.reset_token, expires_at: result.expires_at });
    } catch (err: any) {
      console.error("Forgot password request failed", err);
      setError(err.message || "Unable to initiate password reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10 text-white">
      <div className="w-full max-w-md space-y-6 rounded-[32px] bg-white/10 p-8 shadow-2xl backdrop-blur">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-200">Reset password</p>
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm text-slate-200">
            Enter the email address associated with your account. We’ll generate a reset token for you.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-100">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300/40 bg-white/90 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="you@company.com"
              required
            />
          </label>

          {error && (
            <p className="rounded-2xl border border-rose-200/40 bg-rose-50/20 px-4 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          {response && (
            <div className="space-y-2 rounded-2xl border border-emerald-200/50 bg-emerald-50/20 px-4 py-3 text-sm text-emerald-100">
              <p className="font-semibold">Reset token generated</p>
              <p className="break-all text-xs text-emerald-200">Token: {response.token}</p>
              <p className="text-xs text-emerald-200">Expires at: {new Date(response.expires_at).toLocaleString()}</p>
              <p className="text-xs text-slate-200">
                For development you can copy this token and use it on the reset password form.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset token"}
          </button>
        </form>
      </div>
    </div>
  );
}
