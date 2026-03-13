import type { TemplateRecord, TemplateDetail as TemplateDetailType } from "../../api";
import panelClose from "../../assets/prd-new/panel-close.svg";

const templatePreviewIconPrimary = "https://www.figma.com/api/mcp/asset/fed6d574-7f9b-4e88-a88c-f2b8740f2b21";
const templatePreviewIconSecondary = "https://www.figma.com/api/mcp/asset/e14735ac-bb38-4581-a59e-3045dd7d6621";
const templatePreviewUseIcon = "https://www.figma.com/api/mcp/asset/be361b40-81a1-40d8-b4c6-f772f029e00f";

type TemplateStructure = {
  title: string;
  items: string[];
};

const DEFAULT_STRUCTURE: TemplateStructure[] = [
  {
    title: "Overview",
    items: ["Problem statement", "Proposed solution", "Target users", "Business objectives"],
  },
  {
    title: "User Stories",
    items: ["As a [user type], I want to [action]", "User personas", "Use cases and scenarios"],
  },
  {
    title: "Requirements",
    items: ["Functional requirements", "Non-functional requirements", "Technical constraints", "Dependencies"],
  },
  {
    title: "Success Metrics",
    items: ["Key performance indicators", "Success criteria", "Measurement plan"],
  },
  {
    title: "Timeline",
    items: ["Project phases", "Key milestones", "Launch date"],
  },
];

export type TemplatePreviewModalProps = {
  open: boolean;
  template: TemplateRecord | TemplateDetailType | null;
  loading?: boolean;
  canEdit: boolean;
  onClose(): void;
  onUse(template: TemplateRecord): void;
  onEdit(template: TemplateRecord): void;
  onDelete(template: TemplateRecord): void;
  onFork(template: TemplateRecord): void;
};

export default function TemplatePreviewModal({
  open,
  template,
  loading = false,
  onClose,
  onUse,
}: TemplatePreviewModalProps) {
  if (!open) return null;

  const structure = (() => {
    const metadata = template?.latest_version?.metadata as Record<string, unknown> | null | undefined;
    const sections = metadata?.sections;
    if (Array.isArray(sections) && sections.length > 0) {
      const parsed = sections
        .map((section) => {
          if (typeof section === "string") {
            return { title: section, items: [] };
          }
          if (section && typeof section === "object") {
            const title = typeof (section as { title?: string }).title === "string" ? (section as { title: string }).title : "Section";
            const items = Array.isArray((section as { items?: string[] }).items) ? (section as { items: string[] }).items : [];
            return { title, items };
          }
          return null;
        })
        .filter((section): section is TemplateStructure => Boolean(section));
      if (parsed.length) return parsed;
    }
    return DEFAULT_STRUCTURE;
  })();

  const sectionCount = structure.length;
  const categoryLabel = template?.category ? template.category.toLowerCase() : "feature";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="flex h-[743.5px] w-full max-w-[768px] flex-col overflow-hidden rounded-[16px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
        <div className="border-b border-[#e5e7eb] px-6 pb-px pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="h-16 w-16 rounded-[14px] bg-gradient-to-br from-[#f3e8ff] to-[#dbeafe] p-4">
                <div className="relative h-8 w-8">
                  <img alt="" className="absolute inset-0 h-full w-full" src={templatePreviewIconPrimary} />
                  <img alt="" className="absolute inset-0 h-full w-full" src={templatePreviewIconSecondary} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-[24px] font-bold leading-[32px] tracking-[0.0703px] text-[#101828]">
                    {template?.title ?? "Template Preview"}
                  </p>
                  {template?.is_recommended && (
                    <span className="rounded-full bg-gradient-to-r from-[#ad46ff] to-[#2b7fff] px-2 py-1 text-[12px] font-medium text-white">
                      Popular
                    </span>
                  )}
                </div>
                <p className="text-[14px] leading-[20px] text-[#4a5565]">
                  {template?.description || "Standard template for building a new product feature with user stories and requirements"}
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-[4px] bg-[#f3f4f6] px-2 py-1 text-[12px] text-[#4a5565]">{categoryLabel}</span>
                  <span className="text-[12px] text-[#6a7282]">• {sectionCount} sections</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-9 items-center justify-center rounded-[8px]">
              <img alt="Close" className="h-4 w-4" src={panelClose} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-0 pt-6">
          {loading ? (
            <div className="flex h-full items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              Loading template…
            </div>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[#101828]">Template Structure</p>
              <div className="mt-3 rounded-[10px] border border-[#e5e7eb] bg-white px-6 pb-6 pt-6">
                <div className="space-y-4 text-[14px] text-[#364153]">
                  {structure.map((section, index) => (
                    <div key={`${section.title}-${index}`}>
                      <div className="flex gap-2 font-semibold text-[#101828]">
                        <span>{index + 1}.</span>
                        <span>{section.title}</span>
                      </div>
                      {section.items.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-6 text-[#364153]">
                          {section.items.map((item) => (
                            <li key={`${section.title}-${item}`} className="marker:text-[#99a1af]">
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-[14px] font-medium text-[#0a0a0a]"
            >
              Back to Templates
            </button>
            <button
              type="button"
              onClick={() => template && onUse(template)}
              disabled={!template}
              className={`flex items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-[14px] font-medium text-white ${
                template ? "opacity-100" : "opacity-60"
              }`}
            >
              <img alt="" className="h-4 w-4" src={templatePreviewUseIcon} />
              Use This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
