import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  addUsageCredits,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getUsageAccount,
  getUsageEvents,
  getUsageDashboard,
  getWorkspaceBillingStatus,
  simulateUsageTokens,
  type UsageAccountResponse,
  type UsageDashboardResponse,
  type UsageEventResponse,
  type WorkspaceBillingStatus,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY } from "../constants";

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
}

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageDashboardResponse | null>(null);
  const [usageAccount, setUsageAccount] = useState<UsageAccountResponse | null>(null);
  const [usageEvents, setUsageEvents] = useState<UsageEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"subscribe" | "tokens" | "portal" | "simulate" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = window.sessionStorage.getItem(AUTH_USER_KEY);
    const uid = window.sessionStorage.getItem(USER_ID_KEY);
    if (!auth || !uid) {
      navigate("/signin", { replace: true });
      return;
    }
    setUserId(uid);
  }, [navigate]);

  useEffect(() => {
    if (!workspaceId || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      getWorkspaceBillingStatus(workspaceId, userId),
      getUsageDashboard(workspaceId, userId),
      getUsageAccount(workspaceId, userId),
      getUsageEvents(workspaceId, 12, userId),
    ])
      .then((results) => {
        if (cancelled) return;
        const [billingResult, usageResult, accountResult, eventsResult] = results;

        if (billingResult.status === "fulfilled") {
          setBilling(billingResult.value);
        }
        if (usageResult.status === "fulfilled") {
          setUsage(usageResult.value);
        }
        if (accountResult.status === "fulfilled") {
          setUsageAccount(accountResult.value);
        } else {
          setUsageAccount(null);
        }
        if (eventsResult.status === "fulfilled") {
          setUsageEvents(eventsResult.value);
        } else {
          setUsageEvents([]);
        }

        const blockingFailed =
          billingResult.status === "rejected" && usageResult.status === "rejected";
        if (blockingFailed) {
          const billingError =
            billingResult.reason instanceof Error
              ? billingResult.reason.message
              : "Failed to load subscription details.";
          const usageError =
            usageResult.reason instanceof Error
              ? usageResult.reason.message
              : "Failed to load usage details.";
          setError(`${billingError} ${usageError}`.trim());
          return;
        }
        if (accountResult.status === "rejected" || eventsResult.status === "rejected") {
          setToast("Token activity details are temporarily unavailable.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load subscription details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isSubscribed = useMemo(() => {
    if (!billing) return false;
    const paidPlan = billing.plan === "pro" || billing.plan === "team";
    return paidPlan && billing.status === "active";
  }, [billing]);

  const tokenTotal = 1_000_000;
  const tokenUsed = Math.max(
    0,
    Math.min(tokenTotal, usageAccount?.workspace_consumed_tokens ?? usage?.summary?.weekly_used ?? 0)
  );
  const tokenRemaining = Math.max(
    0,
    usageAccount?.workspace_remaining_tokens ?? usage?.summary?.credits_remaining ?? (tokenTotal - tokenUsed)
  );
  const tokenProgress = Math.max(0, Math.min(100, (tokenUsed / tokenTotal) * 100));

  const handleSubscribe = async () => {
    if (!workspaceId || actionLoading) return;
    setActionLoading("subscribe");
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const successUrl = origin ? `${origin}/workspaces/${workspaceId}/subscription?checkout=success` : undefined;
      const cancelUrl = origin ? `${origin}/workspaces/${workspaceId}/subscription?checkout=cancelled` : undefined;
      const checkout = await createBillingCheckoutSession({
        workspaceId,
        plan: "pro",
        successUrl,
        cancelUrl,
      });
      if (typeof window !== "undefined") {
        window.location.href = checkout.checkout_url;
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to start checkout.");
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    if (!workspaceId || actionLoading) return;
    setActionLoading("portal");
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const returnUrl = origin ? `${origin}/workspaces/${workspaceId}/subscription` : undefined;
      const portal = await createBillingPortalSession({ workspaceId, returnUrl });
      if (typeof window !== "undefined") {
        window.location.href = portal.portal_url;
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to open billing portal.");
      setActionLoading(null);
    }
  };

  const handleBuyTokens = async () => {
    if (!workspaceId || actionLoading) return;
    const firstPackage = usage?.credit_packages?.[0];
    if (!firstPackage) {
      setToast("No token package configured.");
      return;
    }
    setActionLoading("tokens");
    try {
      const updated = await addUsageCredits(workspaceId, firstPackage.id, userId);
      setUsage(updated);
      const [accountRes, eventsRes] = await Promise.all([
        getUsageAccount(workspaceId, userId),
        getUsageEvents(workspaceId, 12, userId),
      ]);
      setUsageAccount(accountRes);
      setUsageEvents(eventsRes);
      setToast("Tokens added successfully.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to buy more tokens.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSimulateUsage = async () => {
    if (!workspaceId || actionLoading) return;
    setActionLoading("simulate");
    try {
      const accountRes = await simulateUsageTokens({
        workspaceId,
        userId,
        totalTokens: 1200,
        feature: "ui.subscription.simulate",
      });
      setUsageAccount(accountRes);
      const [usageRes, eventsRes] = await Promise.all([
        getUsageDashboard(workspaceId, userId),
        getUsageEvents(workspaceId, 12, userId),
      ]);
      setUsage(usageRes);
      setUsageEvents(eventsRes);
      setToast("Simulated token usage applied (1,200 tokens).");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Unable to simulate token usage.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <header className="border-b border-[#e5e7eb] bg-white">
        <div className="mx-auto max-w-[1232px] px-6 pb-6 pt-6">
          <button
            type="button"
            className="text-sm font-medium text-[#4a5565]"
            onClick={() => navigate(workspaceId ? `/workspaces/${workspaceId}/home` : "/")}
          >
            ← Back to Dashboard
          </button>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-[30px] font-bold leading-9 tracking-[0.01em] text-[#101828]">Subscription & Billing</h1>
              <p className="mt-1 text-base text-[#4a5565]">Manage your monthly subscription and token usage</p>
            </div>
            <button
              type="button"
              className="h-9 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => void handleBuyTokens()}
              disabled={loading || actionLoading === "tokens"}
            >
              {actionLoading === "tokens" ? "Processing..." : "Buy More Tokens"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1232px] space-y-8 px-6 py-8">
        {error ? (
          <div className="rounded-xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</div>
        ) : null}

        {!isSubscribed ? (
          <section className="overflow-hidden rounded-[14px] bg-[linear-gradient(167deg,#9810fa_0%,#ad46ff_50%,#155dfc_100%)] p-8 text-white">
            <div className="flex items-start gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
                <span className="text-3xl">♕</span>
              </div>
              <div className="flex-1">
                <h2 className="text-[30px] font-bold leading-9 tracking-[0.01em]">Unlock Pro Access</h2>
                <p className="mt-2 text-[18px] leading-7 text-[#f3e8ff]">Get unlimited access to all features for $8/month.</p>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  {["Unlimited PRDs", "Unlimited Roadmaps", "Unlimited Agents", "1M AI Tokens"].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="text-[#a7f3d0]">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-6 h-[44px] rounded-lg bg-white px-6 text-[18px] font-semibold text-[#9810fa]"
                  onClick={() => void handleSubscribe()}
                  disabled={actionLoading === "subscribe"}
                >
                  {actionLoading === "subscribe" ? "Redirecting..." : "Subscribe for $8/month"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-[14px] border border-black/10 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[24px] font-bold leading-8 text-[#101828]">Monthly Pro Plan</h3>
                <p className="mt-2 text-base text-[#4a5565]">
                  $8/month • {isSubscribed ? `Renews on ${formatDate(billing?.cancel_at)}` : "Not subscribed yet"}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${isSubscribed ? "bg-[#dcfce7] text-[#008236]" : "bg-[#f3f4f6] text-[#6a7282]"}`}>
                {isSubscribed ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-y-4 text-sm text-[#364153]">
              {[
                "Unlimited PRDs",
                "Unlimited Roadmaps",
                "Unlimited Agents",
                "Unlimited Projects",
                "1M AI tokens/month",
                "All integrations",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <span className="text-[#22c55e]">✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 border-t border-[#e5e7eb] pt-5">
              <div className="mb-1 flex items-center justify-between text-sm text-[#4a5565]">
                <span>Token Usage</span>
                <span>
                  {formatNumber(tokenUsed)} / {formatNumber(tokenTotal)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#e5e7eb]">
                <div className="h-2 rounded-full bg-gradient-to-r from-[#9810fa] to-[#155dfc]" style={{ width: `${tokenProgress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#6a7282]">
                <span>{formatNumber(tokenRemaining)} tokens remaining</span>
                <span>{tokenProgress.toFixed(1)}% used</span>
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-black/10 bg-white p-6">
            <h3 className="text-[24px] font-semibold text-[#101828]">Quick Actions</h3>
            <button
              type="button"
              onClick={() => void handleBuyTokens()}
              disabled={actionLoading === "tokens"}
              className="mt-4 h-10 w-full rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-sm font-medium text-white disabled:opacity-60"
            >
              {actionLoading === "tokens" ? "Processing..." : "Buy More Tokens"}
            </button>
            <button
              type="button"
              onClick={() => void handleSimulateUsage()}
              disabled={actionLoading === "simulate"}
              className="mt-2 h-10 w-full rounded-lg border border-black/10 bg-white text-sm font-medium text-[#0a0a0a] disabled:opacity-50"
            >
              {actionLoading === "simulate" ? "Applying..." : "Simulate 1,200 Tokens"}
            </button>
            <button
              type="button"
              onClick={() => void handlePortal()}
              disabled={!isSubscribed || actionLoading === "portal"}
              className="mt-2 h-10 w-full rounded-lg border border-black/10 bg-white text-sm font-medium text-[#101828] disabled:opacity-50"
            >
              {actionLoading === "portal" ? "Opening..." : "Update Payment Method"}
            </button>
            <div className="mt-8 rounded-[10px] border border-[#e9d4ff] bg-[linear-gradient(163deg,#faf5ff_0%,#eff6ff_100%)] p-4">
              <p className="text-sm font-medium text-[#101828]">Token Usage</p>
              <p className="mt-1 text-xs text-[#6a7282]">Each AI interaction uses tokens. Buy more when you run low.</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-[#101828]">Token Statistics</h3>
            <p className="text-sm text-[#6a7282]">Last 30 days</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[14px] border border-black/10 bg-white p-6">
              <p className="text-xs text-[#6a7282]">Total Tokens</p>
              <p className="mt-1 text-[18px] font-bold leading-7 text-[#101828]">{formatNumber(tokenTotal)}</p>
            </div>
            <div className="rounded-[14px] border border-black/10 bg-white p-6">
              <p className="text-xs text-[#6a7282]">Used</p>
              <p className="mt-1 text-[18px] font-bold leading-7 text-[#101828]">{formatNumber(tokenUsed)}</p>
            </div>
            <div className="rounded-[14px] border border-black/10 bg-white p-6">
              <p className="text-xs text-[#6a7282]">Remaining</p>
              <p className="mt-1 text-[18px] font-bold leading-7 text-[#101828]">{formatNumber(tokenRemaining)}</p>
            </div>
            <div className="rounded-[14px] border border-black/10 bg-white p-6">
              <p className="text-xs text-[#6a7282]">Avg. Daily Use</p>
              <p className="mt-1 text-[18px] font-bold leading-7 text-[#101828]">{formatNumber(tokenUsed / 30)}</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-[#101828]">Recent Token Events</h3>
            <p className="text-sm text-[#6a7282]">Latest {usageEvents.length}</p>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-black/10 bg-white">
            <table className="w-full text-left">
              <thead className="bg-[#f9fafb] text-xs uppercase tracking-[0.6px] text-[#4a5565]">
                <tr>
                  <th className="px-6 py-3">Feature</th>
                  <th className="px-6 py-3">Model</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Deducted</th>
                  <th className="px-6 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {usageEvents.length ? (
                  usageEvents.map((event) => (
                    <tr key={event.id} className="border-t border-[#e5e7eb] text-sm">
                      <td className="px-6 py-4 text-[#101828]">{event.feature}</td>
                      <td className="px-6 py-4 text-[#4a5565]">{event.model || event.provider}</td>
                      <td className="px-6 py-4 text-[#101828]">{formatNumber(event.total_tokens)}</td>
                      <td className="px-6 py-4 text-[#101828]">{formatNumber(event.deducted_tokens)}</td>
                      <td className="px-6 py-4 text-[#4a5565]">{formatDate(event.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-[#e5e7eb] text-sm">
                    <td className="px-6 py-6 text-[#6a7282]" colSpan={5}>
                      No token usage events yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-[#101828]">Billing History</h3>
            <button type="button" className="h-8 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#0a0a0a]">
              Download All
            </button>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-black/10 bg-white">
            <table className="w-full text-left">
              <thead className="bg-[#f9fafb] text-xs uppercase tracking-[0.6px] text-[#4a5565]">
                <tr>
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#e5e7eb] text-sm">
                  <td className="px-6 py-5 font-medium text-[#101828]">INV-{new Date().getFullYear()}-03-001</td>
                  <td className="px-6 py-5 text-[#4a5565]">{formatDate(new Date().toISOString())}</td>
                  <td className="px-6 py-5 text-[#4a5565]">Monthly Subscription</td>
                  <td className="px-6 py-5 font-medium text-[#101828]">$8.00</td>
                  <td className="px-6 py-5">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSubscribed ? "bg-[#dcfce7] text-[#008236]" : "bg-[#f3f4f6] text-[#6a7282]"}`}>
                      {isSubscribed ? "Paid" : "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right text-[#4a5565]">↓</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[14px] border border-black/10 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-semibold text-[#101828]">Payment Method</h3>
              <button
                type="button"
                onClick={() => void handlePortal()}
                disabled={!isSubscribed || actionLoading === "portal"}
                className="h-8 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#0a0a0a] disabled:opacity-50"
              >
                Update
              </button>
            </div>
            <div className="mt-8 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#2b7fff] to-[#155dfc] text-xl text-white">💳</div>
              <div>
                <p className="text-sm font-medium text-[#101828]">•••• •••• •••• 4242</p>
                <p className="text-xs text-[#6a7282]">Expires 12/2027</p>
              </div>
            </div>
          </div>
          <div className="rounded-[14px] border border-[#e9d4ff] bg-[linear-gradient(163deg,#faf5ff_0%,#eff6ff_100%)] p-6">
            <h3 className="text-[18px] font-semibold text-[#101828]">Need Help?</h3>
            <p className="mt-2 text-sm text-[#4a5565]">
              Have questions about your subscription or billing? Our support team is here to help.
            </p>
            <button type="button" className="mt-4 h-8 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#0a0a0a]">
              Contact Support
            </button>
          </div>
        </section>
      </main>

      {toast ? (
        <div className="fixed bottom-6 right-6 rounded-lg bg-[#101828] px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}
