import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import logoIcon from "../assets/dashboard/logo-icon.svg";
import navDashboard from "../assets/dashboard/nav-dashboard.svg";
import productBotChat from "../assets/dashboard/productbot-chat.svg";
import navProjects from "../assets/dashboard/nav-projects.svg";
import navPrds from "../assets/dashboard/nav-prds.svg";
import navRoadmaps from "../assets/dashboard/nav-roadmaps.svg";
import navTasks from "../assets/dashboard/nav-tasks.svg";
import navAgents from "../assets/dashboard/nav-agents.svg";
import navIntegrations from "../assets/dashboard/nav-integrations.svg";
import userMenu from "../assets/dashboard/user-menu.svg";
import {
  createBillingCheckoutSession,
  getDashboardHome,
  getWorkspaceBillingStatus,
  logout,
  type DashboardHome,
} from "../api";
import { AUTH_USER_KEY, SHOW_SUBSCRIPTION_MODAL_KEY, USER_ID_KEY } from "../constants";

const NAV_ITEMS = [
  { label: "Dashboard", icon: navDashboard, active: true },
  { label: "AI Chat", icon: productBotChat, route: "ai-chat" },
  { label: "Projects", icon: navProjects, route: "projects" },
  { label: "PRDs", icon: navPrds, route: "prds" },
  { label: "Roadmaps", icon: navRoadmaps, route: "roadmaps" },
  { label: "Task Boards", icon: navTasks, route: "tasks" },
  { label: "AI Agents", icon: navAgents, route: "agents" },
  { label: "Integrations", icon: navIntegrations, route: "integrations" },
];

const PROJECT_ROW_COLORS = ["#8b5cf6", "#2563eb", "#10b981", "#f97316", "#ec4899"];

function SubscriptionIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="none">
      <rect x="3.5" y="5.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 8.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SparkTileIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#f3e8ff_0%,#dbeafe_100%)]">
      <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none">
        <path
          d="M13.5 2 6 13.2h5L10.5 22 18 10.8h-5L13.5 2Z"
          stroke="url(#spark-gradient)"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="spark-gradient" x1="6" y1="2" x2="18" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9810fa" />
            <stop offset="1" stopColor="#155dfc" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function MetricIcon({
  tone,
  children,
}: {
  tone: "purple" | "blue" | "green" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    purple: "from-[#f3e8ff] to-[#faf5ff] text-[#8b5cf6]",
    blue: "from-[#dbeafe] to-[#eff6ff] text-[#2563eb]",
    green: "from-[#dcfce7] to-[#f0fdf4] text-[#16a34a]",
    amber: "from-[#fef3c7] to-[#fff7ed] text-[#d97706]",
  };
  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tones[tone]}`}>
      {children}
    </div>
  );
}

function ProjectGlyph({ color }: { color: string }) {
  return <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />;
}

function PanelHeaderIcon({ type }: { type: "activity" | "upcoming" | "team" }) {
  const common = "h-5 w-5";
  if (type === "activity") {
    return (
      <svg aria-hidden="true" className={common} viewBox="0 0 20 20" fill="none">
        <rect x="3.5" y="4" width="13" height="12" rx="2.5" stroke="#155dfc" strokeWidth="1.6" />
        <path d="M6.5 8h7M6.5 11h5" stroke="#155dfc" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "upcoming") {
    return (
      <svg aria-hidden="true" className={common} viewBox="0 0 20 20" fill="none">
        <rect x="3.5" y="4.5" width="13" height="11.5" rx="2.5" stroke="#8b5cf6" strokeWidth="1.6" />
        <path d="M6.5 2.8v3M13.5 2.8v3M3.5 8h13" stroke="#8b5cf6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={common} viewBox="0 0 20 20" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="#10b981" strokeWidth="1.6" />
      <circle cx="13.5" cy="8.5" r="2" stroke="#10b981" strokeWidth="1.6" />
      <path
        d="M3.8 15.3c.7-2 2.7-3.3 5-3.3s4.3 1.3 5 3.3M11.4 15.4c.4-1.3 1.7-2.2 3.2-2.2 1.4 0 2.6.8 3 2"
        stroke="#10b981"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatDateLabel(value?: string | null) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function relativeUpdate(value?: string | null) {
  if (!value) return "Updated recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${formatDateLabel(value)}`;
}

function badgeClasses(tone: "purple" | "blue" | "green" | "amber") {
  const classes = {
    purple: "bg-[#faf5ff] text-[#8200db] border-[#eadcff]",
    blue: "bg-[#eff6ff] text-[#155dfc] border-[#bfdbfe]",
    green: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
    amber: "bg-[#fff7ed] text-[#d97706] border-[#fed7aa]",
  };
  return classes[tone];
}

export default function WorkspaceLanding() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [dashboardHome, setDashboardHome] = useState<DashboardHome | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const profile = useMemo(() => {
    if (typeof window === "undefined") {
      return { name: "User", subtitle: "Workspace member", initials: "U", email: "" };
    }
    const raw = window.sessionStorage.getItem(AUTH_USER_KEY);
    let displayName = "";
    let email = "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { display_name?: string | null; email?: string | null };
        displayName = (parsed.display_name || "").trim();
        email = (parsed.email || "").trim();
      } catch {
        // ignore malformed session payload
      }
    }
    const fallbackName = email ? email.split("@")[0] : "User";
    const resolvedName = displayName || fallbackName;
    const label =
      resolvedName
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk[0]?.toUpperCase() || "")
        .join("") || "U";
    const subtitle = email || "Workspace member";
    return { name: resolvedName, subtitle, initials: label, email };
  }, []);
  const userId = typeof window !== "undefined" ? window.sessionStorage.getItem(USER_ID_KEY) ?? "" : "";

  const overview = dashboardHome?.metrics ?? null;

  const kpiCards = useMemo(
    () => [
      {
        label: "Active PRDs",
        value: String(overview?.prds.length ?? 0),
        detail: overview?.prds.length ? `${overview.prds.length} documents in motion` : "No PRDs created yet",
        tone: "purple" as const,
        icon: (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
            <rect x="4" y="2.8" width="12" height="14.4" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M7 7h6M7 10.2h6M7 13.4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        label: "Roadmap Items",
        value: String(overview?.roadmap.total_tasks ?? 0),
        detail: overview?.roadmap.current_phase
          ? `Current phase: ${overview.roadmap.current_phase}`
          : "No roadmap phase set yet",
        tone: "blue" as const,
        icon: (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
            <path d="M4.5 15.5V4.5M4.5 5.2h7.3l-1.2 2.7 4.4 1.9-1.2 2.8H4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        label: "Tasks Completed",
        value: String(overview?.tasks.done ?? 0),
        detail: overview?.tasks.total ? `${overview.tasks.total} total tracked tasks` : "No tracked tasks yet",
        tone: "green" as const,
        icon: (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
            <rect x="3.8" y="3.8" width="12.4" height="12.4" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
            <path d="m7.3 10.3 1.9 1.9 3.8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        label: "AI Automations",
        value: String(dashboardHome?.ai_automations ?? 0),
        detail: dashboardHome?.ai_automations ? `${dashboardHome.ai_automations} active workspace agents` : "No agents configured yet",
        tone: "amber" as const,
        icon: (
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
            <rect x="5" y="5" width="10" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 2.8v2M12 2.8v2M8 15.2v2M12 15.2v2M2.8 8h2M2.8 12h2M15.2 8h2M15.2 12h2M8 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
    [dashboardHome, overview]
  );

  const activeProjects = useMemo(
    () =>
      (dashboardHome?.active_projects || []).map((project, index) => ({
        ...project,
        progress: project.progress_percent,
        color: project.color || PROJECT_ROW_COLORS[index % PROJECT_ROW_COLORS.length],
      })),
    [dashboardHome]
  );

  const recentActivity = useMemo(() => dashboardHome?.recent_activity || [], [dashboardHome]);

  const upcomingItems = useMemo(
    () =>
      (dashboardHome?.upcoming || []).map((item) => ({
        ...item,
        progress: item.progress_percent,
      })),
    [dashboardHome]
  );

  const visibleMembers = useMemo(() => {
    if (dashboardHome?.team?.length) return dashboardHome.team.slice(0, 4);
    return [
      {
        id: "fallback-user",
        user_id: "fallback-user",
        email: profile.email,
        display_name: profile.name,
        role: "admin",
      },
    ];
  }, [dashboardHome, profile.email, profile.name]);

  const handleNavClick = (route?: string) => {
    if (!workspaceId || !route) return;
    navigate(`/workspaces/${workspaceId}/${route}`);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // best effort logout
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
    navigate("/signin", { replace: true });
  };

  const openAccountMenu = () => {
    if (accountMenuCloseTimer.current) {
      clearTimeout(accountMenuCloseTimer.current);
      accountMenuCloseTimer.current = null;
    }
    setShowAccountMenu(true);
  };

  const closeAccountMenu = () => {
    if (accountMenuCloseTimer.current) {
      clearTimeout(accountMenuCloseTimer.current);
    }
    accountMenuCloseTimer.current = setTimeout(() => {
      setShowAccountMenu(false);
      accountMenuCloseTimer.current = null;
    }, 150);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId || !userId) return;

    let cancelled = false;
    setDashboardLoading(true);
    setDashboardError(null);

    void getDashboardHome(workspaceId, userId)
      .then((response) => {
        if (cancelled) return;
        setDashboardHome(response);
      })
      .catch((error) => {
        if (cancelled) return;
        setDashboardError(error instanceof Error ? error.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) return;

    const forceShow = window.sessionStorage.getItem(SHOW_SUBSCRIPTION_MODAL_KEY) === "1";
    const seenKey = `pmassist:subscription-modal-seen:${workspaceId}`;

    if (forceShow) {
      setShowSubscriptionModal(true);
      return;
    }

    if (window.localStorage.getItem(seenKey) === "1") {
      return;
    }

    let cancelled = false;
    void getWorkspaceBillingStatus(workspaceId)
      .then((billing) => {
        if (cancelled) return;
        const hasPaidPlan = billing.plan === "pro" || billing.plan === "team";
        const hasActiveBilling = billing.status === "active";
        if (!hasPaidPlan || !hasActiveBilling) {
          setShowSubscriptionModal(true);
        }
      })
      .catch(() => {
        // Ignore billing fetch errors here; avoid blocking page render.
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (accountMenuCloseTimer.current) {
        clearTimeout(accountMenuCloseTimer.current);
      }
    };
  }, []);

  const closeSubscriptionModal = () => {
    if (typeof window !== "undefined") {
      if (workspaceId) {
        window.localStorage.setItem(`pmassist:subscription-modal-seen:${workspaceId}`, "1");
      }
      window.sessionStorage.removeItem(SHOW_SUBSCRIPTION_MODAL_KEY);
    }
    setShowSubscriptionModal(false);
    setCheckoutError(null);
  };

  const handleLifetimeAccess = async () => {
    if (!workspaceId || checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const successUrl = origin ? `${origin}/workspaces/${workspaceId}/home?checkout=success` : undefined;
      const cancelUrl = origin ? `${origin}/workspaces/${workspaceId}/home?checkout=cancelled` : undefined;
      const checkout = await createBillingCheckoutSession({
        workspaceId,
        plan: "pro",
        successUrl,
        cancelUrl,
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SHOW_SUBSCRIPTION_MODAL_KEY);
        window.location.href = checkout.checkout_url;
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to start checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f8fafc]">
      <div className="flex h-screen">
        <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-[#e5e7eb] bg-white">
          <div className="border-b border-[#e5e7eb] px-6 py-6">
            <div className="flex items-center gap-3">
              <img alt="" className="h-8 w-8" src={logoIcon} />
              <span
                className="text-[20px] font-bold tracking-[-0.4492px]"
                style={{
                  WebkitTextFillColor: "transparent",
                  backgroundImage:
                    "linear-gradient(90deg, rgba(152, 16, 250, 1) 0%, rgba(21, 93, 252, 1) 100%)",
                  backgroundClip: "text",
                }}
              >
                8product.com
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  className={`flex h-12 w-full items-center gap-3 rounded-[10px] px-4 text-[16px] font-medium tracking-[-0.3125px] ${
                    item.active ? "bg-[#faf5ff] text-[#8200db]" : "text-[#364153]"
                  }`}
                  type="button"
                  onClick={() => handleNavClick(item.route)}
                >
                  <img alt="" className="h-5 w-5" src={item.icon} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto border-t border-[#e5e7eb] px-4 py-4">
            <button
              type="button"
              className="flex h-12 w-full items-center gap-3 rounded-[10px] px-4 text-[16px] font-medium tracking-[-0.3125px] text-[#364153]"
              onClick={() => handleNavClick("subscription")}
            >
              <SubscriptionIcon />
              Subscription
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <header className="border-b border-[#e5e7eb] bg-white px-8 py-5">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <SparkTileIcon />
                <div>
                  <h1 className="text-[28px] font-bold tracking-[-0.035em] text-[#111827]">Product Workspace</h1>
                  <p className="mt-1 text-[15px] text-[#6b7280]">
                    Keep execution, planning, and AI workflows aligned in one place.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-[13px] font-medium text-[#4b5563] lg:flex">
                  {overview ? `Updated ${formatDateLabel(overview.updated_at)}` : "Dashboard"}
                </div>
                <div className="relative pb-2" onMouseEnter={openAccountMenu} onMouseLeave={closeAccountMenu}>
                  <div className="flex min-w-[256px] items-center gap-3 rounded-[14px] border border-[#e5e7eb] bg-white px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#9810fa] text-[14px] font-semibold text-white">
                      {profile.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold leading-[18px] text-[#101828]">{profile.name}</p>
                      <p className="truncate text-[12px] leading-[16px] text-[#6a7282]">{profile.subtitle}</p>
                    </div>
                    <img alt="" className="h-4 w-4 shrink-0" src={userMenu} />
                  </div>
                  {showAccountMenu ? (
                    <div className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-[10px] border border-[#e5e7eb] bg-white p-2 shadow-lg">
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="w-full rounded-[8px] px-3 py-2 text-left text-[14px] font-medium text-[#ef4444] hover:bg-[#fff1f2]"
                      >
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <section className="px-8 py-8">
            {dashboardError ? (
              <div className="mb-6 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-5 py-4 text-[14px] text-[#b91c1c]">
                {dashboardError}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpiCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-[20px] border border-[#e5e7eb] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#9ca3af]">{card.label}</p>
                      <p className="mt-3 text-[34px] font-bold tracking-[-0.04em] text-[#111827]">
                        {dashboardLoading ? "..." : card.value}
                      </p>
                    </div>
                    <MetricIcon tone={card.tone}>{card.icon}</MetricIcon>
                  </div>
                  <p className="mt-4 text-[14px] leading-[20px] text-[#6b7280]">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Execution Snapshot</p>
                  <h2 className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#111827]">Active Projects</h2>
                  <p className="mt-1 text-[14px] text-[#6b7280]">Monitor the projects that are currently driving the workspace forward.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleNavClick("projects")}
                  className="rounded-full border border-[#e5e7eb] px-4 py-2 text-[14px] font-semibold text-[#374151] transition hover:bg-[#f8fafc]"
                >
                  View all projects
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {activeProjects.length ? (
                  activeProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => navigate(`/workspaces/${workspaceId}/projects/detail/${project.id}`)}
                      className="grid w-full grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_96px] items-center gap-4 rounded-[18px] border border-[#edf1f5] bg-[#fcfcfd] px-5 py-5 text-left transition hover:border-[#dbe4ff] hover:bg-white"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <ProjectGlyph color={project.color || "#8b5cf6"} />
                          <p className="truncate text-[16px] font-semibold text-[#111827]">{project.title}</p>
                        </div>
                        <p className="mt-2 truncate text-[14px] text-[#6b7280]">{project.description || "No description yet"}</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[13px] font-medium text-[#6b7280]">
                          <span>{project.meta}</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#9810fa_0%,#155dfc_100%)]"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right text-[13px] text-[#6b7280]">{relativeUpdate(project.last_updated)}</div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fcfcfd] px-5 py-10 text-center text-[14px] text-[#6b7280]">
                    {dashboardLoading ? "Loading projects..." : "No projects yet. Create one to start organizing work."}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_380px]">
              <div className="space-y-6">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-3">
                    <PanelHeaderIcon type="activity" />
                    <div>
                      <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#111827]">Recent Activity</h3>
                      <p className="mt-1 text-[14px] text-[#6b7280]">Latest planning updates across PRDs, roadmaps, and task work.</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {recentActivity.length ? (
                      recentActivity.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-4 rounded-[18px] border border-[#edf1f5] bg-[#fcfcfd] px-5 py-4"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-[#111827]">{item.title}</p>
                            <p className="mt-1 text-[13px] text-[#6b7280]">{item.meta}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold ${badgeClasses(item.badge_tone)}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fcfcfd] px-5 py-10 text-center text-[14px] text-[#6b7280]">
                        {dashboardLoading ? "Loading recent activity..." : "Activity will appear here as your workspace gets used."}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-3">
                    <PanelHeaderIcon type="upcoming" />
                    <div>
                      <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#111827]">Upcoming</h3>
                      <p className="mt-1 text-[14px] text-[#6b7280]">What needs attention next across your active portfolio.</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {upcomingItems.length ? (
                      upcomingItems.map((item) => (
                        <div key={item.id} className="rounded-[18px] border border-[#edf1f5] bg-[#fcfcfd] px-5 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[15px] font-semibold text-[#111827]">{item.title}</p>
                            <span className="rounded-full bg-[#f3e8ff] px-3 py-1 text-[12px] font-semibold text-[#8200db]">
                              {item.progress}%
                            </span>
                          </div>
                          <p className="mt-2 text-[13px] text-[#6b7280]">{item.description}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fcfcfd] px-5 py-10 text-center text-[14px] text-[#6b7280]">
                        No upcoming work yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-[0_20px_48px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-3">
                    <PanelHeaderIcon type="team" />
                    <div>
                      <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#111827]">Team</h3>
                      <p className="mt-1 text-[14px] text-[#6b7280]">People collaborating in this workspace right now.</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {visibleMembers.map((member, index) => {
                      const initials =
                        member.display_name
                          ?.split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() || "")
                          .join("") || "U";
                      const avatarTone = PROJECT_ROW_COLORS[index % PROJECT_ROW_COLORS.length];
                      return (
                        <div key={member.id || member.user_id} className="flex items-center gap-3 rounded-[18px] border border-[#edf1f5] bg-[#fcfcfd] px-4 py-3">
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                            style={{ backgroundColor: avatarTone }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-[#111827]">{member.display_name}</p>
                            <p className="truncate text-[13px] text-[#6b7280]">{member.email}</p>
                          </div>
                          <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-[12px] font-semibold capitalize text-[#155dfc]">
                            {member.role}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {showSubscriptionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[448px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
            <div className="relative h-[245px] bg-[linear-gradient(151deg,#9810fa_0%,#ad46ff_50%,#155dfc_100%)] px-6 pt-6 text-white">
              <button
                type="button"
                className="absolute right-4 top-4 rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                onClick={closeSubscriptionModal}
                aria-label="Close"
              >
                ✕
              </button>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
                <svg aria-hidden="true" className="h-10 w-10" viewBox="0 0 24 24" fill="none">
                  <path d="M4 8.5 8 12l4-6 4 6 4-3.5-1.5 10H5.5L4 8.5Z" stroke="white" strokeWidth="1.75" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="mt-3 text-center text-[36px] font-bold leading-10 tracking-[0.03em] text-white">Unlock Pro Access</h2>
              <p className="mt-1 text-center text-base text-[#f3e8ff]">Get full access to all features</p>
              <div className="mt-3 flex items-end justify-center gap-1">
                <span className="text-5xl font-bold leading-none tracking-[0.01em]">$8</span>
                <span className="pb-[6px] text-lg text-[#e9d4ff]">/month</span>
              </div>
            </div>
            <div className="px-6 pb-5 pt-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#f3e8ff] px-3 py-1 text-sm font-medium text-[#8200db]">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v3M12 18v3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M3 12h3M18 12h3M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                Includes 1M AI Tokens
              </div>
              <p className="mt-3 max-w-[360px] text-sm leading-5 text-[#4a5565]">
                Everything you need to build amazing products with AI assistance.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-x-7 gap-y-2 text-sm text-[#364153]">
                {[
                  "Unlimited PRDs",
                  "Unlimited Roadmaps",
                  "Unlimited Agents",
                  "Unlimited Projects",
                  "1M AI tokens/month",
                  "All integrations",
                  "Priority support",
                  "Regular updates",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <svg aria-hidden="true" className="h-4 w-4 text-[#22c55e]" viewBox="0 0 20 20" fill="none">
                      <path d="m4.5 10 3.5 3.5 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              {checkoutError ? (
                <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">
                  {checkoutError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleLifetimeAccess()}
                disabled={checkoutLoading || !workspaceId}
                className="mt-4 h-10 w-full rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] text-base font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkoutLoading ? "Redirecting..." : "Subscribe for $8/month"}
              </button>
              <button
                type="button"
                onClick={closeSubscriptionModal}
                className="mt-2 h-9 w-full rounded-lg text-sm font-medium text-[#6a7282] transition hover:bg-[#f8fafc]"
              >
                Skip for now
              </button>
              <p className="mt-2 text-center text-xs leading-4 text-[#6a7282]">
                Join thousands of product managers building better products with AI
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
