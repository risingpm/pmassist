import ReactMarkdown from "react-markdown";
import { SURFACE_CARD, SURFACE_MUTED, SECONDARY_BUTTON } from "../styles/theme";

type RoadmapPreviewProps = {
  content?: string | null;
  onViewFull?: () => void;
};

export default function RoadmapPreview({ content, onViewFull }: RoadmapPreviewProps) {
  if (!content) {
    return (
      <div className={`${SURFACE_MUTED} border-dashed px-4 py-6 text-center text-sm text-slate-500`}>
        The roadmap preview will appear here after the assistant finalizes a draft.
      </div>
    );
  }

  return (
    <div className={`${SURFACE_CARD} p-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Roadmap preview</h3>
        {onViewFull && (
          <button type="button" onClick={onViewFull} className={SECONDARY_BUTTON}>
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
