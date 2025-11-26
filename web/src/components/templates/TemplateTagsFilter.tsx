import { useMemo } from "react";
import type { TemplateRecord } from "../../api";

export type TemplateTagsFilterProps = {
  templates: TemplateRecord[];
  activeTag?: string | null;
  onSelect(tag: string | null): void;
};

export function TemplateTagsFilter({ templates, activeTag, onSelect }: TemplateTagsFilterProps) {
  const tags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((template) => {
      (template.tags || []).forEach((tag) => set.add(tag));
    });
    return Array.from(set).sort();
  }, [templates]);

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
          !activeTag ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        All tags
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(tag)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            activeTag === tag ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

export default TemplateTagsFilter;
