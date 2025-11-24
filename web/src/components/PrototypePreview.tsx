type PrototypePreviewProps = {
  html?: string | null;
  isLoading?: boolean;
};

export default function PrototypePreview({ html, isLoading = false }: PrototypePreviewProps) {
  if (isLoading) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        🛠 Building your prototype...
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/70 text-sm text-slate-500">
        Prototype preview will render here once you chat with the builder.
      </div>
    );
  }

  return (
    <iframe
      title="Prototype Preview"
      className="h-[520px] w-full rounded-3xl border border-slate-200 shadow-2xl"
      sandbox="allow-scripts allow-same-origin"
      srcDoc={html}
    />
  );
}
