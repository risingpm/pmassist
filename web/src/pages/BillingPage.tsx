import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { BadgeCheck, CreditCard, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";

import {
  confirmBillingCheckout,
  createBillingCheckoutSession,
  createBillingPortalSession,
  getWorkspaceBillingStatus,
  type BillingPlan,
  type BillingStatus,
  type WorkspaceBillingStatus,
} from "../api";
import { USER_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";

const PLAN_DETAILS: Record<
  BillingPlan,
  { name: string; price: string; blurb: string; highlights: string[] }
> = {
  trial: {
    name: "Free Trial",
    price: "$0",
    blurb: "Explore core workflows with limited credits.",
    highlights: ["200 AI credits", "Community support", "Single seat"],
  },
  pro: {
    name: "Pro",
    price: "$49 / month",
    blurb: "Unlock unlimited workspaces, automations, and premium AI capacity.",
    highlights: ["Unlimited projects", "Priority support", "Advanced automations"],
  },
  team: {
    name: "Team",
    price: "Contact us",
    blurb: "Tailored rollout with workspace governance and shared credits.",
    highlights: ["Dedicated support partner", "Shared credit pools", "Workspace analytics"],
  },
};

const STATUS_COPY: Record<
  BillingStatus,
  { label: string; tone: string; badgeClass: string }
> = {
  inactive: {
    label: "Inactive",
    tone: "Activate a plan to unlock advanced features.",
    badgeClass: "bg-slate-200 text-slate-700",
  },
  pending: {
    label: "Pending",
    tone: "We’re waiting for Stripe to confirm your subscription.",
    badgeClass: "bg-amber-100 text-amber-700",
  },
  active: {
    label: "Active",
    tone: "Your subscription is active. Enjoy the full experience.",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  past_due: {
    label: "Past Due",
    tone: "Update your payment method to avoid interruptions.",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  canceled: {
    label: "Canceled",
    tone: "Subscribe again anytime to regain access.",
    badgeClass: "bg-slate-200 text-slate-700",
  },
};

export default function BillingPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const [workspaceName] = useState(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  });
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [portalMessage, setPortalMessage] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const checkoutState = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  const portalState = searchParams.get("portal");

  useEffect(() => {
    if (!workspaceId || !userId) {
      setError("Workspace context missing. Sign in again to manage billing.");
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const status = await getWorkspaceBillingStatus(workspaceId, userId);
        setBilling(status);
      } catch (err: any) {
        setError(err.message || "Unable to load billing details right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, userId]);

  useEffect(() => {
    if (checkoutState !== "success" || !sessionId || !workspaceId || !userId) {
      return;
    }
    setConfirmingCheckout(true);
    confirmBillingCheckout({ workspaceId, sessionId, userId })
      .then((status) => {
        setBilling(status);
        setConfirmationMessage("Subscription activated. You're all set!");
      })
      .catch((err: any) => {
        setConfirmationMessage(err.message || "Payment confirmed. Status will refresh shortly.");
      })
      .finally(() => {
        setConfirmingCheckout(false);
      });
  }, [checkoutState, sessionId, workspaceId, userId]);

  useEffect(() => {
    if (portalState !== "return" || !billing) {
      return;
    }
    if (billing.status === "canceled") {
      setPortalMessage("Subscription canceled successfully. You're back on the trial plan.");
    } else {
      setPortalMessage("Subscription updated. Your latest status is shown below.");
    }
  }, [portalState, billing]);

  const currentPlan = billing ? PLAN_DETAILS[billing.plan] : PLAN_DETAILS.trial;
  const statusCopy = billing ? STATUS_COPY[billing.status] : STATUS_COPY.inactive;
  const isProPlan = billing?.plan === "pro";
  const isActivePro = isProPlan && billing.status === "active";
  const isRetryState = isProPlan && !isActivePro;
  const primaryButtonLabel = isProPlan ? (isActivePro ? "Manage subscription" : "Retry payment") : "Upgrade to Pro";
  const primaryLoading = isRetryState ? actionLoading : portalLoading;
  const formatDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const cancelAtFormatted = formatDate(billing?.cancel_at);
  const canceledAtFormatted = formatDate(billing?.canceled_at);

  const handleUpgrade = async () => {
    if (!workspaceId || !userId) {
      setCheckoutError("Workspace context missing. Sign in again to manage billing.");
      return;
    }
    setCheckoutError(null);
    setActionLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const successUrl = origin ? `${origin}/workspaces/${workspaceId}/billing?checkout=success` : undefined;
      const cancelUrl = origin ? `${origin}/workspaces/${workspaceId}/billing?checkout=cancelled` : undefined;
      const session = await createBillingCheckoutSession({
        workspaceId,
        plan: "pro",
        successUrl,
        cancelUrl,
        userId,
      });
      window.location.href = session.checkout_url;
    } catch (err: any) {
      setCheckoutError(err.message || "Unable to start checkout. Try again in a moment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!workspaceId || !userId) {
      setCheckoutError("Workspace context missing. Sign in again to manage billing.");
      return;
    }
    if (!billing?.stripe_customer_id) {
      setCheckoutError("Subscription is still provisioning. Try again once Stripe syncs.");
      return;
    }
    setCheckoutError(null);
    setPortalLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const returnUrl = origin ? `${origin}/workspaces/${workspaceId}/billing?portal=return` : undefined;
      const session = await createBillingPortalSession({
        workspaceId,
        returnUrl,
        userId,
      });
      window.location.href = session.portal_url;
    } catch (err: any) {
      setCheckoutError(err.message || "Unable to open the billing portal. Try again shortly.");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Billing</p>
          <h1 className="text-3xl font-semibold text-slate-900">Subscription</h1>
          <p className="text-sm text-slate-500">
            Manage your workspace plan, download invoices, and keep payments up to date.
          </p>
          <p className="text-xs text-slate-400">Workspace: {workspaceName}</p>
        </header>

        {checkoutState === "success" && (
          <div className="mt-6 flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <BadgeCheck className="h-4 w-4" />
            {confirmationMessage ||
              (confirmingCheckout
                ? "Payment confirmed. Syncing with Stripe..."
                : "Payment confirmed. Your subscription status will refresh shortly.")}
          </div>
        )}
        {portalMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <BadgeCheck className="h-4 w-4" />
            {portalMessage}
          </div>
        )}
        {billing?.status === "canceled" && (
          <div className="mt-6 flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <ShieldAlert className="h-4 w-4" />
            {canceledAtFormatted
              ? `Subscription ended on ${canceledAtFormatted}. You can restart any time.`
              : "Subscription is canceled. You can restart any time."}
          </div>
        )}
        {checkoutState === "cancelled" && (
          <div className="mt-6 flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4" />
            Checkout was cancelled. Start again when you’re ready.
          </div>
        )}
        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <ShieldAlert className="h-4 w-4" />
            {error}
          </div>
        )}

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Current Plan</p>
                <h2 className="text-2xl font-semibold text-slate-900">{currentPlan.name}</h2>
                <p className="text-sm text-slate-500">{currentPlan.blurb}</p>
              </div>
              <span className={`ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusCopy.badgeClass}`}>
                {statusCopy.label}
              </span>
            </div>
            <p className="mt-6 text-3xl font-semibold text-slate-900">{currentPlan.price}</p>
            <p className="mt-1 text-sm text-slate-500">{statusCopy.tone}</p>
            <ul className="mt-6 space-y-3 text-sm text-slate-600">
              {currentPlan.highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!workspaceId || !userId) return;
                  setLoading(true);
                  setError(null);
                  getWorkspaceBillingStatus(workspaceId, userId)
                    .then((status) => setBilling(status))
                    .catch((err: any) => setError(err.message || "Unable to refresh status right now."))
                    .finally(() => setLoading(false));
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh status
              </button>
              <button
                type="button"
                disabled={primaryLoading}
                onClick={isRetryState ? handleUpgrade : handleManageSubscription}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {primaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {primaryButtonLabel}
              </button>
            </div>
            {checkoutError && <p className="mt-3 text-sm text-rose-600">{checkoutError}</p>}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Details</p>
            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading billing info
              </div>
            ) : billing ? (
              <dl className="mt-6 space-y-4 text-sm text-slate-600">
                <div>
                  <dt className="text-xs uppercase tracking-[0.25em] text-slate-400">Plan ID</dt>
                  <dd className="mt-1 font-mono text-slate-900">{billing.plan}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.25em] text-slate-400">Stripe Customer</dt>
                  <dd className="mt-1 font-mono text-slate-900">
                    {billing.stripe_customer_id || "Pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.25em] text-slate-400">Subscription</dt>
                  <dd className="mt-1 font-mono text-slate-900">
                    {billing.stripe_subscription_id || "Pending"}
                  </dd>
                </div>
                {(cancelAtFormatted || canceledAtFormatted) && (
                  <div>
                    <dt className="text-xs uppercase tracking-[0.25em] text-slate-400">Cancellation</dt>
                    <dd className="mt-1 text-slate-900">
                      {canceledAtFormatted
                        ? `Ended on ${canceledAtFormatted}`
                        : cancelAtFormatted
                          ? `Scheduled for ${cancelAtFormatted}`
                          : null}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-6 text-sm text-slate-500">No billing information yet. Start a plan to populate this section.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
