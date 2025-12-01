import { Link } from "react-router-dom";

type BackLink = {
  to: string;
  label: string;
};

type WorkspaceBackLinksProps = {
  links: BackLink[];
  className?: string;
};

export default function WorkspaceBackLinks({ links, className }: WorkspaceBackLinksProps) {
  if (!links || links.length === 0) return null;
  const containerClass = ["flex flex-wrap gap-3", className].filter(Boolean).join(" ");

  return (
    <div className={containerClass}>
      {links.map(({ to, label }) => (
        <Link
          key={`${label}-${to}`}
          to={to}
          className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          <span aria-hidden="true">←</span>
          {label}
        </Link>
      ))}
    </div>
  );
}
