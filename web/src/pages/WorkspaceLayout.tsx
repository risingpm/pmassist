import { useEffect, useMemo, useState, type ElementType } from "react";
import { Navigate, NavLink, Outlet, useParams } from "react-router-dom";
import { LayoutDashboard, FolderKanban, BookMarked, Archive, Bot, Settings2 } from "lucide-react";

import { USER_ID_KEY, WORKSPACE_ID_KEY, WORKSPACE_NAME_KEY } from "../constants";
import AICoachButton from "../components/AICoachButton";
import { useUserRole } from "../context/RoleContext";

type NavItem = {
  label: string;
  path: string;
  icon: ElementType;
};

const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", path: "dashboard", icon: LayoutDashboard },
  { label: "Projects", path: "projects", icon: FolderKanban },
  { label: "Knowledge Base", path: "knowledge", icon: BookMarked },
  { label: "Template Library", path: "templates", icon: Archive },
  { label: "AI Agents", path: "agents", icon: Bot },
];

const SETTINGS_NAV: NavItem[] = [{ label: "Workspace Settings", path: "settings", icon: Settings2 }];

export default function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const { workspaceRole } = useUserRole();
  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);
  const [workspaceName] = useState(() => {
    if (typeof window === "undefined") return "Workspace";
    return window.sessionStorage.getItem(WORKSPACE_NAME_KEY) || "Workspace";
  });

  useEffect(() => {
    if (!workspaceId) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
    }
  }, [workspaceId]);

  if (!workspaceId) {
    return <Navigate to="/onboarding" replace />;
  }

  const roleLabel = workspaceRole.charAt(0).toUpperCase() + workspaceRole.slice(1);

  const renderNavSection = (title: string, items: NavItem[]) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">{title}</p>
      <nav className="mt-3 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={`/workspaces/${workspaceId}/${item.path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  isActive ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <Icon fontSize="small" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white/90 px-4 py-6 shadow-sm backdrop-blur lg:flex">
        <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">
            8
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Workspace</p>
              <p className="text-sm font-semibold text-slate-900">{workspaceName}</p>
              <p className="text-xs text-slate-500">Role: {roleLabel}</p>
            </div>
          </div>
        </div>
        <div className="mt-6 space-y-6">
          {renderNavSection("Main", MAIN_NAV)}
          {renderNavSection("Settings", SETTINGS_NAV)}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <AICoachButton workspaceId={workspaceId} userId={userId} />
    </div>
  );
}
