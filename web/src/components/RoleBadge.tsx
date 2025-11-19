import type { ProjectRole, WorkspaceRole } from "../api";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-amber-100 text-amber-800",
  editor: "bg-sky-100 text-sky-800",
  viewer: "bg-slate-100 text-slate-700",
  owner: "bg-emerald-100 text-emerald-800",
  contributor: "bg-indigo-100 text-indigo-800",
};

export default function RoleBadge({ role }: { role: WorkspaceRole | ProjectRole }) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  const style = ROLE_STYLES[role] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
