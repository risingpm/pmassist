type AgentAvatarProps = {
  size?: "xs" | "sm" | "md";
  className?: string;
  name?: string;
};

const sizeMap: Record<NonNullable<AgentAvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-base",
};

export default function AgentAvatar({ size = "md", className = "", name }: AgentAvatarProps) {
  const sizeClasses = sizeMap[size];
  const label = name?.[0]?.toUpperCase() ?? "∞";
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-indigo-500 to-purple-500 font-semibold text-white shadow-lg ${sizeClasses} ${className}`}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}
