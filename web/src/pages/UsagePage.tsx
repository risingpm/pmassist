import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  CreditCard,
  Info,
  LineChart,
  LogOut,
  Loader2,
  PlusCircle,
  Sparkles,
  Users2,
  Zap,
} from "lucide-react";

import { addUsageCredits, getUsageDashboard, logout, type UsageDashboardResponse } from "../api";
import {
  AUTH_USER_KEY,
  USER_ID_KEY,
  WORKSPACE_ID_KEY,
  WORKSPACE_NAME_KEY,
  WIDE_PAGE_CONTAINER,
} from "../constants";

type UsageWindow = "daily" | "weekly" | "monthly";
type BreakdownRange = "7d" | "30d" | "all";
type BreakdownType = "all" | "chat" | "generation" | "tasks";
type SortKey = "requests" | "credits";

interface BreakdownRow {
  feature: string;
  requests: number;
  credits: number;
  lastUsed: string;
  type: BreakdownType;
}

interface UsageWindowData {
  id: UsageWindow;
  label: string;
  used: number;
  total: number;
  reset: string;
  coverage: string;
}

interface UsageHistoryEntry {
  id: string;
  period: string;
  usage: string;
  change: string;
  changeTone: "up" | "neutral" | "badge";
  insight: string;
}

interface WorkspaceMemberUsage {
  name: string;
  percent: number;
  avatarColor: string;
}

interface MotivationMessage {
  id: string;
  title: string;
  subtitle: string;
  tone: "positive" | "critical";
}

interface PlanComparison {
  id: string;
  name: string;
  limit: string;
  credits: string;
  price: string;
  highlight: boolean;
}

interface UsageSummaryMeta {
  planTier: string;
  weeklyLimit: number;
  weeklyUsed: number;
  creditsRemaining: number;
  lastReset: string | null;
  windowLabel: string;
  resetLabel: string;
  recommendationCopy: string;
  personalUsagePercent: number;
}

const rangeMultiplier: Record<BreakdownRange, number> = {
  "7d": 1,
  "30d": 1.6,
  all: 2.4,
};

const typeLabels: Record<BreakdownType, string> = {
  all: "All usage",
  chat: "AI chat",
  generation: "Generation",
  tasks: "Automation runs",
};

function UsageBar({
  label,
  used,
  total,
  reset,
  coverage,
  planTier,
  isAnimating,
}: {
  label: string;
  used: number;
  total: number;
  reset: string;
  coverage: string;
  planTier: string;
  isAnimating?: boolean;
}) {
  const percentage = Math.min(100, Math.round((used / total) * 100));
  const capExceeded = used > total;
  const gradient =
    percentage >= 100 || capExceeded
      ? "from-rose-500 to-rose-600"
      : percentage >= 80
        ? "from-amber-400 to-orange-500"
        : "from-emerald-400 to-teal-500";

  return (
    <div className="group relative space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white/70">{label}</p>
          <p className="text-xl font-semibold tracking-tight text-white">
            {used.toLocaleString()} / {total.toLocaleString()} credits
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            capExceeded ? "bg-rose-500/10 text-rose-200" : "bg-white/10 text-white/90"
          }`}
        >
          {capExceeded ? "Exceeded" : `${percentage}% used`}
        </span>
      </div>

      <div className="relative h-4 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
          style={{ width: `${capExceeded ? 100 : percentage}%` }}
        />
        {isAnimating && (
          <span className="pointer-events-none absolute -top-6 right-4 animate-bounce text-xs font-semibold text-emerald-200">
            + credits added
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-white/70">
        <span className="flex items-center gap-1">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {reset}
        </span>
        <span className="text-white/60">{coverage}</span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 -top-3 hidden rounded-2xl border border-white/20 bg-slate-950/95 p-4 text-xs text-white shadow-2xl group-hover:block">
        <p className="font-semibold">{planTier} plan</p>
        <p className="mt-1 text-white/70">{coverage}</p>
        <p className="mt-2 text-emerald-300">Usage resets automatically. Add credits anytime for extra requests.</p>
      </div>
    </div>
  );
}

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-8 text-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-indigo-500">Usage</p>
            <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-base text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-900"
          >
            ×
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export default function UsagePage() {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const workspaceId = useMemo(() => {
    if (routeWorkspaceId) return routeWorkspaceId;
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, [routeWorkspaceId]);
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);
  const workspaceName = useMemo(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  }, []);

  const [usageWindowsData, setUsageWindowsData] = useState<UsageWindowData[]>([]);
  const [motivationMessages, setMotivationMessages] = useState<MotivationMessage[]>([]);
  const [breakdownRows, setBreakdownRows] = useState<BreakdownRow[]>([]);
  const [usageHistoryRows, setUsageHistoryRows] = useState<UsageHistoryEntry[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberUsage[]>([]);
  const [personalHighlights, setPersonalHighlights] = useState<{ label: string; value: string }[]>([]);
  const [planComparisons, setPlanComparisons] = useState<PlanComparison[]>([]);
  const [creditPackages, setCreditPackages] = useState<Array<{ id: string; label: string; credits: number; price: number; bonus?: string | null }>>([]);
  const [summaryData, setSummaryData] = useState<UsageSummaryMeta | null>(null);
  const [alertCards, setAlertCards] = useState<UsageDashboardResponse["alert_cards"]>([]);
  const [toastAlerts, setToastAlerts] = useState<UsageDashboardResponse["toast_alerts"]>([]);
  const [isCreditModalOpen, setCreditModalOpen] = useState(false);
  const [isUpgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedCreditPack, setSelectedCreditPack] = useState<string | null>(null);
  const [creditAnimation, setCreditAnimation] = useState(false);
  const [breakdownExpanded, setBreakdownExpanded] = useState(true);
  const [breakdownRange, setBreakdownRange] = useState<BreakdownRange>("7d");
  const [breakdownType, setBreakdownType] = useState<BreakdownType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("credits");
  const [usagePerspective, setUsagePerspective] = useState<"personal" | "workspace">("personal");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creditPurchaseLoading, setCreditPurchaseLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId && routeWorkspaceId) {
      navigate(`/workspaces/${routeWorkspaceId}/usage`, { replace: true });
    }
  }, [navigate, routeWorkspaceId, workspaceId]);

  const weeklyLimit = summaryData?.weeklyLimit ?? 0;
  const weeklyUsed = summaryData?.weeklyUsed ?? 0;
  const usagePercent = weeklyLimit > 0 ? Math.round((weeklyUsed / weeklyLimit) * 100) : 0;
  const weeklyExceeded = weeklyLimit > 0 ? weeklyUsed >= weeklyLimit : false;
  const weeklyRemaining = weeklyLimit ? Math.max(0, weeklyLimit - weeklyUsed) : 0;

  const summaryState =
    weeklyExceeded || usagePercent >= 100
      ? {
          title: "You're out of messages",
          message: "Add credits or upgrade to continue collaborating with AI.",
          tone: "critical" as const,
        }
      : usagePercent >= 80
        ? {
            title: `You’ve used ${usagePercent}% of your weekly limit`,
            message: "Add credits now so work never pauses mid-sprint.",
            tone: "warning" as const,
          }
        : {
            title: "You’ve got plenty of runway",
            message: "Kick off PRDs, brainstorm with AI, or schedule a custom agent.",
            tone: "positive" as const,
          };

  const syncDashboard = useCallback((payload: UsageDashboardResponse) => {
    setUsageWindowsData(
      payload.windows.map((window) => ({
        id: window.id as UsageWindow,
        label: window.label,
        used: window.used,
        total: window.total,
        reset: window.reset,
        coverage: window.coverage,
      }))
    );
    setMotivationMessages(payload.motivation_messages as MotivationMessage[]);
    setBreakdownRows(
      payload.breakdown.map((row) => ({
        feature: row.feature,
        requests: row.requests,
        credits: row.credits,
        lastUsed: row.last_used,
        type: (row.type as BreakdownType) || "all",
      }))
    );
    setUsageHistoryRows(
      payload.history.map((entry) => ({
        id: entry.id,
        period: entry.period,
        usage: entry.usage,
        change: entry.change,
        changeTone: (entry.change_tone as UsageHistoryEntry["changeTone"]) || "neutral",
        insight: entry.insight,
      }))
    );
    setWorkspaceMembers(
      payload.workspace_members.map((member) => ({
        name: member.name,
        percent: member.percent,
        avatarColor: member.avatar_color || "bg-indigo-500",
      }))
    );
    setPersonalHighlights(payload.personal_highlights);
    setPlanComparisons(payload.plan_comparisons as PlanComparison[]);
    setCreditPackages(payload.credit_packages);
    setAlertCards(payload.alert_cards);
    setToastAlerts(payload.toast_alerts);
    setSummaryData({
      planTier: payload.summary.plan_tier,
      weeklyLimit: payload.summary.weekly_limit,
      weeklyUsed: payload.summary.weekly_used,
      creditsRemaining: payload.summary.credits_remaining,
      lastReset: payload.summary.last_reset,
      windowLabel: payload.summary.window_label,
      resetLabel: payload.summary.reset_label,
      recommendationCopy: payload.summary.recommendation_copy,
      personalUsagePercent: payload.summary.personal_usage_percent,
    });
  }, []);

  const loadUsage = useCallback(async () => {
    if (!workspaceId) {
      setError("Workspace context missing. Select a workspace to continue.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getUsageDashboard(workspaceId, userId);
      syncDashboard(data);
    } catch (err: any) {
      setError(err.message || "Unable to load usage dashboard.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, syncDashboard]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const filteredBreakdown = useMemo(() => {
    const multiplier = rangeMultiplier[breakdownRange];
    const rows = breakdownRows
      .filter((row) => breakdownType === "all" || row.type === breakdownType)
      .map((row) => ({
        ...row,
        requests: Math.round(row.requests * multiplier),
        credits: Math.round(row.credits * multiplier),
      }));
    return rows.sort((a, b) => b[sortKey] - a[sortKey]);
  }, [breakdownRange, breakdownType, sortKey, breakdownRows]);

  const totalCreditsUsed = filteredBreakdown.reduce((sum, row) => sum + row.credits, 0);

  const handleCreditPurchase = async () => {
    if (!workspaceId || !selectedCreditPack) return;
    setCreditPurchaseLoading(true);
    try {
      const updated = await addUsageCredits(workspaceId, selectedCreditPack, userId);
      syncDashboard(updated);
      setCreditModalOpen(false);
      setCreditAnimation(true);
      setToast(updated.purchase_message || "Credits added → your usage bar just refilled.");
      setTimeout(() => setCreditAnimation(false), 1400);
      setTimeout(() => setToast(null), 3200);
    } catch (err: any) {
      setToast(err.message || "Unable to add credits right now.");
      setTimeout(() => setToast(null), 3200);
    } finally {
      setCreditPurchaseLoading(false);
    }
  };

  const formatShortDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const lastResetDisplay = formatShortDate(summaryData?.lastReset);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      console.warn("Sign out request failed", err);
    }
    if (typeof window !== "undefined") {
      [AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY].forEach((key) => {
        window.sessionStorage.removeItem(key);
      });
    }
    navigate("/signin", { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <span className="text-xs uppercase tracking-[0.3em] text-white/60">Loading usage…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <p className="text-sm text-white/80">{error}</p>
        <button
          type="button"
          onClick={loadUsage}
          className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-20 text-white">
      <header className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className={`${WIDE_PAGE_CONTAINER} flex flex-wrap items-center justify-between gap-4 py-10`}>
          <div>
            <p className="text-sm uppercase tracking-widest text-indigo-300">Settings / Usage</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Usage & Credits</h1>
            <p className="text-sm text-white/70">Workspace: {workspaceName}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              <Crown className="h-4 w-4 text-amber-300" aria-hidden="true" />
              Upgrade plan
            </button>
            <button
              type="button"
              onClick={() => setCreditModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Add credits
            </button>
          </div>
        </div>
      </header>

      <main className={`${WIDE_PAGE_CONTAINER} mt-10 flex flex-col gap-8 lg:flex-row`}>
        <aside className="hidden w-64 flex-shrink-0 flex-col rounded-3xl border border-white/10 bg-white/5 p-6 lg:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Workspace</p>
            <h2 className="mt-3 text-xl font-semibold text-white">Usage controls</h2>
            <p className="text-sm text-white/60">Quick links for billing, alerts, and credits.</p>
          </div>
          <nav className="mt-8 space-y-2 text-sm font-medium text-white/70">
            {["Overview", "Usage alerts", "Breakdown", "History", "Plans"].map((item) => (
              <button
                key={item}
                type="button"
                className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-2 text-left transition hover:border-white/20 hover:text-white"
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-8">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex-1 space-y-8">
          <div className="lg:hidden">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
          <section className="grid gap-6 md:grid-cols-2">
            <div
              className={`rounded-3xl border ${
                summaryState.tone === "critical"
                  ? "border-rose-500/40 bg-rose-500/10"
                  : summaryState.tone === "warning"
                  ? "border-amber-400/40 bg-amber-400/10"
                  : "border-emerald-400/30 bg-emerald-400/5"
            } p-8`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Summary</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{summaryState.title}</h2>
                <p className="mt-2 text-white/70">{summaryState.message}</p>
              </div>
              <Sparkles className="h-8 w-8 text-white/40" aria-hidden="true" />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCreditModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Add credits
              </button>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                View plans
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-center justify-between text-white/80">
              <div>
                <p className="text-sm uppercase tracking-widest text-white/50">Plan tier</p>
                <h3 className="text-2xl font-semibold text-white">
                  {summaryData ? `${summaryData.planTier} · ${summaryData.windowLabel} limit` : "—"}
                </h3>
                <p className="text-sm text-white/60">
                  {summaryData?.resetLabel || "Resets automatically"}
                  {lastResetDisplay ? ` • Last reset ${lastResetDisplay}` : null}
                </p>
              </div>
              <CheckCircle2 className="h-7 w-7 text-emerald-300" aria-hidden="true" />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-white/60">Credits remaining</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {summaryData ? Math.max(0, summaryData.creditsRemaining).toLocaleString() : "—"}
                </p>
                <p className="text-xs text-white/60">Refill with add-ons anytime.</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-white/60">Last reset</p>
                <p className="mt-2 text-xl font-semibold text-white">{lastResetDisplay ?? "Not set"}</p>
                <p className="text-xs text-white/60">{summaryData?.resetLabel || "Resets weekly"}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs text-white/60">Usage window</p>
                <p className="mt-2 text-xl font-semibold text-white">{summaryData?.windowLabel ?? "Weekly"}</p>
                <p className="text-xs text-white/60">Fair-use protected</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {usageWindowsData.map((window) => (
              <UsageBar
                key={window.id}
                label={window.label}
                used={window.used}
                total={window.total}
                reset={window.reset}
                coverage={window.coverage}
                planTier={summaryData?.planTier ?? "Starter"}
                isAnimating={creditAnimation && window.id === "weekly"}
              />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-slate-900/70 to-indigo-900/50 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/50">Balance</p>
                  <h3 className="mt-2 text-3xl font-semibold">
                    {weeklyExceeded ? "0 credits remaining" : `${weeklyRemaining.toLocaleString()} credits left`}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">You’ll reset automatically, but add credits anytime for uninterrupted work.</p>
                </div>
                <div className="rounded-full bg-slate-900/70 p-4">
                  <BatteryIcon used={usagePercent} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreditModalOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Add credits or top up
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-indigo-300" aria-hidden="true" />
                <p className="text-sm text-white/70">Usage resets automatically and appears in your history log.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {motivationMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl border border-dashed p-4 ${
                      message.tone === "critical"
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                        : "border-emerald-400/40 bg-emerald-500/10 text-emerald-50"
                    }`}
                  >
                    <p className="text-sm font-semibold">{message.title}</p>
                    <p className="text-xs opacity-80">{message.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">Usage alerts</p>
              <h3 className="text-2xl font-semibold text-white">Stay informed without interruptions</h3>
            </div>
            <div className="flex gap-2">
              {["7d", "30d", "all"].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setBreakdownRange(range as BreakdownRange)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    breakdownRange === range ? "bg-white text-slate-900" : "bg-white/10 text-white/70"
                  }`}
                >
                  {range === "7d" ? "7 days" : range === "30d" ? "30 days" : "All time"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {alertCards.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${
                  alert.tone === "critical"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-50"
                    : "border-amber-400/40 bg-amber-400/10 text-white"
                }`}
              >
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">{alert.message}</p>
                  <p className="text-xs opacity-80">Appears as toast + dashboard banner.</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/60">Usage breakdown</p>
              <h3 className="text-2xl font-semibold text-white">See where every credit went</h3>
              <p className="text-sm text-white/60">Filter by time or activity type to understand ROI.</p>
            </div>
            <button
              type="button"
              onClick={() => setBreakdownExpanded((prev) => !prev)}
              className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/80"
            >
              {breakdownExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {breakdownExpanded && (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {Object.entries(typeLabels).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBreakdownType(key as BreakdownType)}
                    className={`rounded-full px-4 py-1.5 text-sm ${
                      breakdownType === key ? "bg-indigo-400 text-slate-900" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
                  <Info className="h-4 w-4" aria-hidden="true" />
                  Sorted by{" "}
                  <button
                    type="button"
                    className="font-semibold text-white underline-offset-2 hover:underline"
                    onClick={() => setSortKey((prev) => (prev === "credits" ? "requests" : "credits"))}
                  >
                    {sortKey === "credits" ? "Credits used" : "Requests"}
                  </button>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full border-collapse text-left text-sm text-white/80">
                  <thead className="bg-white/10 text-xs uppercase tracking-widest text-white/60">
                    <tr>
                      <th className="px-4 py-3">Feature</th>
                      <th className="px-4 py-3 text-right"># of requests</th>
                      <th className="px-4 py-3 text-right">Credits used</th>
                      <th className="px-4 py-3 text-right">Last used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBreakdown.map((row) => (
                      <tr key={row.feature} className="border-t border-white/5">
                        <td className="px-4 py-3 font-semibold text-white">{row.feature}</td>
                        <td className="px-4 py-3 text-right">{row.requests}</td>
                        <td className="px-4 py-3 text-right">{row.credits}</td>
                        <td className="px-4 py-3 text-right text-white/60">{row.lastUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td className="px-4 py-3 font-semibold text-white">Total</td>
                      <td className="px-4 py-3 text-right text-white/80">
                        {filteredBreakdown.reduce((sum, row) => sum + row.requests, 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{totalCreditsUsed}</td>
                      <td className="px-4 py-3 text-right text-white/60">Current view</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">Usage history</p>
                <h3 className="text-2xl font-semibold text-white">Reset timeline</h3>
              </div>
              <LineChart className="h-6 w-6 text-indigo-300" aria-hidden="true" />
            </div>
            <div className="mt-6 space-y-4">
              {usageHistoryRows.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white/60">{entry.period}</p>
                      <p className="text-xl font-semibold text-white">{entry.usage}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        entry.changeTone === "up"
                          ? "bg-emerald-400/10 text-emerald-200"
                          : entry.changeTone === "badge"
                            ? "bg-indigo-400/20 text-indigo-200"
                            : "bg-white/10 text-white/70"
                      }`}
                    >
                      {entry.change}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-white/70">{entry.insight}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">Team vs personal</p>
                <h3 className="text-2xl font-semibold text-white">Workspace visibility</h3>
              </div>
              <Users2 className="h-6 w-6 text-indigo-300" aria-hidden="true" />
            </div>

            <div className="mt-4 flex gap-2">
              {["personal", "workspace"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setUsagePerspective(mode as "personal" | "workspace")}
                  className={`flex-1 rounded-2xl px-4 py-2 text-sm font-semibold ${
                    usagePerspective === mode ? "bg-white text-slate-900" : "bg-white/10 text-white/70"
                  }`}
                >
                  {mode === "personal" ? "My usage" : "Workspace"}
                </button>
              ))}
            </div>

            {usagePerspective === "personal" ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/60">Your contribution</p>
                  <p className="text-3xl font-semibold text-white">
                    {summaryData ? `${summaryData.personalUsagePercent}% of workspace activity` : "Workspace activity"}
                  </p>
                  <p className="text-sm text-white/60">You’ve initiated the most AI drafts this week.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {personalHighlights.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                      <p className="text-2xl font-semibold text-white">{item.value}</p>
                      <p className="text-xs text-white/60">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {workspaceMembers.map((member) => (
                  <div key={member.name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${member.avatarColor}`}>
                      {member.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{member.name}</p>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600" style={{ width: `${member.percent}%` }} />
                      </div>
                    </div>
                    <p className="text-sm text-white/70">{member.percent}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/60">Upgrade recommendations</p>
              <h3 className="text-2xl font-semibold text-white">Choose the runway that fits</h3>
              <p className="text-sm text-white/60">{summaryData?.recommendationCopy || "Based on the last 7 days, Pro plan fits you best."}</p>
            </div>
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Compare plans
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {planComparisons.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 ${
                  plan.highlight ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-lg font-semibold text-white">{plan.name}</p>
                  {plan.highlight && (
                    <span className="text-xs font-semibold uppercase tracking-widest text-indigo-200">Recommended</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-white/60">Monthly limit</p>
                <p className="text-2xl font-semibold text-white">{plan.limit}</p>
                <p className="mt-2 text-sm text-white/60">Credits</p>
                <p className="text-xl font-semibold text-white">{plan.credits}</p>
                <p className="mt-4 text-sm text-white/60">{plan.price}</p>
              </div>
            ))}
          </div>
        </section>
        </div>
      </main>

      {toastAlerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 space-y-3">
          {toastAlerts.map((toastItem) => (
            <div
              key={toastItem.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${
                toastItem.tone === "critical" ? "bg-rose-500 text-white" : "bg-amber-400 text-slate-900"
              }`}
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              {toastItem.message}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-6 z-40 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-xl">
          {toast}
        </div>
      )}

      <Modal
        open={isCreditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title="Add credits"
        subtitle="Top up instantly — bars animate with a +bounce when the credits land."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {creditPackages.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setSelectedCreditPack(pack.id)}
              className={`rounded-2xl border p-4 text-left ${
                selectedCreditPack === pack.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{pack.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{pack.credits}</p>
              <p className="text-sm text-slate-500">${pack.price}</p>
              {pack.bonus && <p className="mt-2 text-xs font-semibold text-indigo-500">{pack.bonus}</p>}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!selectedCreditPack || creditPurchaseLoading}
          onClick={handleCreditPurchase}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {creditPurchaseLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
          {creditPurchaseLoading ? "Processing…" : "Confirm purchase"}
        </button>
      </Modal>

      <Modal
        open={isUpgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade plan"
        subtitle="Compare plans, limits, and credit multipliers."
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Monthly limit</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Price</th>
              </tr>
            </thead>
            <tbody>
              {planComparisons.map((plan) => (
                <tr key={plan.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {plan.name}
                    {plan.highlight && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600">Recommended</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{plan.limit}</td>
                  <td className="px-4 py-3">{plan.credits}</td>
                  <td className="px-4 py-3">{plan.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-500">Based on your last 7 days, Pro keeps your workflow uninterrupted.</p>
        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
          Upgrade to Pro
        </button>
      </Modal>
    </div>
  );
}

function BatteryIcon({ used }: { used: number }) {
  const safeBar = Math.max(0, Math.min(100, 100 - used));
  return (
    <div className="flex flex-col items-center text-xs text-white/70">
      <div className="flex items-center gap-1">
        <div className="h-8 w-3 rounded bg-white/10" />
        <div className="h-10 w-16 rounded-md border border-white/30 p-1">
          <div className="flex h-full gap-0.5">
            {[...Array(5)].map((_, index) => {
              const threshold = (index + 1) * 20;
              const active = 100 - safeBar >= threshold;
              return (
                <span key={threshold} className={`flex-1 rounded-sm ${active ? "bg-rose-400" : "bg-white/10"}`} />
              );
            })}
          </div>
        </div>
      </div>
      <span className="mt-1">Usage</span>
    </div>
  );
}
