import { useMemo, useState } from "react";
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
import welcomeIcon from "../assets/dashboard/welcome-icon.svg";
import cardPrd from "../assets/dashboard/card-prd.svg";
import cardRoadmap from "../assets/dashboard/card-roadmap.svg";
import cardProjects from "../assets/dashboard/card-projects.svg";
import cardAgent from "../assets/dashboard/card-agent.svg";
import infoBot from "../assets/dashboard/info-bot.svg";
import infoProjects from "../assets/dashboard/info-projects.svg";
import helpIcon from "../assets/dashboard/help-icon.svg";
import { logout } from "../api";
import { AUTH_USER_KEY } from "../constants";

function HomeChatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7 17 2.5-2h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const START_CARDS = [
  {
    title: "Chat with AI",
    description: "Talk to AI about your projects",
    icon: productBotChat,
    gradient: "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(152, 16, 250, 1) 100%)",
    action: "ai-chat",
  },
  {
    title: "New PRD",
    description: "Create a product requirements document",
    icon: cardPrd,
    gradient: "linear-gradient(135deg, rgba(173, 70, 255, 1) 0%, rgba(152, 16, 250, 1) 100%)",
    action: "new-prd",
  },
  {
    title: "Build Roadmap",
    description: "Plan your product timeline",
    icon: cardRoadmap,
    gradient: "linear-gradient(135deg, rgba(43, 127, 255, 1) 0%, rgba(21, 93, 252, 1) 100%)",
    action: "roadmaps",
  },
  {
    title: "Projects",
    description: "View and manage your projects",
    icon: cardProjects,
    gradient: "linear-gradient(135deg, rgba(0, 201, 80, 1) 0%, rgba(0, 166, 62, 1) 100%)",
    action: "projects",
  },
  {
    title: "Create Agent",
    description: "Build an AI automation",
    icon: cardAgent,
    gradient: "linear-gradient(135deg, rgba(255, 105, 0, 1) 0%, rgba(245, 73, 0, 1) 100%)",
    action: "agents",
  },
];

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

export default function WorkspaceLanding() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const profile = useMemo(() => {
    if (typeof window === "undefined") {
      return { name: "User", subtitle: "Workspace member", initials: "U" };
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
    const label = resolvedName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() || "")
      .join("") || "U";
    const subtitle = email || "Workspace member";
    return { name: resolvedName, subtitle, initials: label };
  }, []);

  const handleStartCardClick = (action?: string) => {
    if (!workspaceId) return;
    if (action === "new-prd") {
      navigate(`/workspaces/${workspaceId}/prd/new`);
      return;
    }
    if (action === "projects") {
      navigate(`/workspaces/${workspaceId}/projects`);
      return;
    }
    if (action === "roadmaps") {
      navigate(`/workspaces/${workspaceId}/roadmaps`);
      return;
    }
    if (action === "agents") {
      navigate(`/workspaces/${workspaceId}/agents`);
      return;
    }
    if (action === "ai-chat") {
      navigate(`/workspaces/${workspaceId}/ai-chat`);
    }
  };

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

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-[#e5e7eb] bg-white">
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
                8product.ai
              </span>
            </div>
          </div>

          <div className="px-4 pt-4">
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

        </aside>

        <main className="flex-1">
        <header className="border-b border-[#e5e7eb] bg-white px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[24px] font-bold tracking-[0.0703px] text-[#101828]">
                  Product Workspace
                </h1>
                <p className="text-[14px] text-[#6a7282]">Welcome back, {profile.name}!</p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="relative"
                  onMouseEnter={() => setShowAccountMenu(true)}
                  onMouseLeave={() => setShowAccountMenu(false)}
                >
                <div className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] px-3 py-1.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#9810fa] text-[13px] font-medium text-white">
                    {profile.initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium leading-[16px] text-[#101828]">{profile.name}</p>
                    <p className="text-[11px] leading-[14px] text-[#6a7282]">{profile.subtitle}</p>
                  </div>
                  <img alt="" className="h-4 w-4" src={userMenu} />
                </div>
                  {showAccountMenu ? (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[180px] rounded-[10px] border border-[#e5e7eb] bg-white p-2 shadow-lg">
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

        <section className="px-10 py-8">
            <div className="flex flex-col items-center text-center">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(243, 232, 255, 1) 0%, rgba(219, 234, 254, 1) 100%)",
                }}
              >
                <img alt="" className="h-12 w-12" src={welcomeIcon} />
              </div>
              <h2 className="mt-6 text-[30px] font-bold tracking-[0.3955px] text-[#101828]">
                Welcome to Product Workspace!
              </h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-[20px] text-[#6a7282]">
                Start with what matters most to you right now. Create PRDs, build roadmaps, manage tasks, or organize
                everything into projects later.
              </p>
            </div>

            <div className="mt-10 text-center">
              <p className="text-[18px] font-semibold tracking-[-0.4395px] text-[#101828]">
                Choose where to start
              </p>
              <div className="mx-auto mt-4 grid w-full max-w-[920px] grid-cols-2 gap-4">
                {START_CARDS.map((card) => (
                  <button
                    key={card.title}
                    className="rounded-[14px] border-2 border-[#e5e7eb] bg-white p-4 text-left"
                    onClick={() => handleStartCardClick(card.action)}
                    type="button"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                      style={{ backgroundImage: card.gradient }}
                    >
                      {card.action === "ai-chat" ? (
                        <span className="text-white">
                          <HomeChatIcon className="h-5 w-5" />
                        </span>
                      ) : (
                        <img alt="" className="h-5 w-5" src={card.icon} />
                      )}
                    </div>
                    <p className="mt-3 text-[16px] font-semibold tracking-[-0.3125px] text-[#101828]">
                      {card.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-[18px] text-[#6a7282]">{card.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-[14px] border border-[#f3e8ff] bg-[#faf5ff] px-6 py-6">
                <div className="flex items-center gap-2">
                  <img alt="" className="h-5 w-5" src={infoBot} />
                  <p className="text-[16px] font-semibold tracking-[-0.3125px] text-[#101828]">
                    AI-Powered Assistance
                  </p>
                </div>
                <p className="mt-2 text-[14px] leading-[20px] text-[#4a5565]">
                  ProductBot is ready to help you write better PRDs, plan roadmaps, and automate workflows.
                </p>
              </div>
              <div className="rounded-[14px] border border-[#dbeafe] bg-[#eff6ff] px-6 py-6">
                <div className="flex items-center gap-2">
                  <img alt="" className="h-5 w-5" src={infoProjects} />
                  <p className="text-[16px] font-semibold tracking-[-0.3125px] text-[#101828]">
                    Organize with Projects
                  </p>
                </div>
                <p className="mt-2 text-[14px] leading-[20px] text-[#4a5565]">
                  When you're ready, group related work into projects to keep everything organized in one place.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-[14px] text-[#6a7282]">
              <img alt="" className="h-4 w-4" src={helpIcon} />
              Need guidance? Chat with ProductBot anytime
            </div>
        </section>
        </main>
      </div>
    </div>
  );
}
