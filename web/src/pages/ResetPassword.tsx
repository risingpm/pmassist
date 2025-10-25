import { useState } from "react";
import { resetPassword } from "../api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token.trim(), password);
      setSuccess(true);
      setToken("");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      console.error("Password reset failed", err);
      setError(err.message || "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10 text-white">
      <div className="w-full max-w-md space-y-6 rounded-[32px] bg-white/10 p-8 shadow-2xl backdrop-blur">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-200">Reset password</p>
          <h1 className="text-2xl font-bold">Enter reset token</h1>
          <p className="text-sm text-slate-200">
            Paste the reset token you received and choose a new password.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-100">
            Reset token
            <textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border border-slate-300/40 bg-white/90 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Paste the token here"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-100">
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300/40 bg-white/90 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Minimum 8 characters"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-100">
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-300/40 bg-white/90 px-4 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Re-enter password"
              required
            />
          </label>

          {error && (
            <p className="rounded-2xl border border-rose-200/40 bg-rose-50/20 px-4 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-2xl border border-emerald-200/40 bg-emerald-50/20 px-4 py-2 text-sm text-emerald-100">
              Password reset successfully. You can now sign in with your new password.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
