import type { BuilderPrototypeRecord } from "../api";

type PrototypeCardProps = {
  prototype: BuilderPrototypeRecord;
  onSelect?: (prototype: BuilderPrototypeRecord) => void;
};

export default function PrototypeCard({ prototype, onSelect }: PrototypeCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(prototype)}
      className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Prototype</p>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">{prototype.title}</h3>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{prototype.prompt}</p>
      </div>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Click to open in the builder
      </div>
      <p className="text-xs text-slate-400">
        Saved {new Date(prototype.created_at).toLocaleString()}
      </p>
    </button>
  );
}
