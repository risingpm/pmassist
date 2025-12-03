type RoadmapProgressBarProps = {
  value: number;
  label?: string;
};

export default function RoadmapProgressBar({ value, label }: RoadmapProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value || 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label ?? "Progress"}</span>
        <span className="font-semibold text-slate-700">{clamped}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
