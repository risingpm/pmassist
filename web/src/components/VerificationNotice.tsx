import type { VerificationDetails } from "../api";

type VerificationNoticeProps = {
  verification?: VerificationDetails | null;
  className?: string;
};

const toneMap: Record<VerificationDetails["status"], string> = {
  passed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  declined: "border-amber-200 bg-amber-50 text-amber-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
};

export default function VerificationNotice({ verification, className }: VerificationNoticeProps) {
  if (!verification) return null;
  const tone = toneMap[verification.status] ?? toneMap.skipped;
  return (
    <div className={`rounded-2xl border px-3 py-2 text-xs font-medium ${tone} ${className ?? ""}`}>
      {verification.message}
    </div>
  );
}
