import ReactMarkdown from "react-markdown";

type RoadmapPreviewProps = {
  content?: string | null;
  onViewFull?: () => void;
};

export default function RoadmapPreview({ content, onViewFull }: RoadmapPreviewProps) {
  if (!content) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        The roadmap preview will appear here after the assistant finalizes a draft.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Roadmap preview</h3>
        {onViewFull && (
          <button
            type="button"
            onClick={onViewFull}
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          >
            📄 View full roadmap
          </button>
        )}
      </div>
      <div className="prose prose-sm mt-4 max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
