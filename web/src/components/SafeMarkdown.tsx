import { marked } from "marked";

interface SafeMarkdownProps {
  children: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function SafeMarkdown({ children }: SafeMarkdownProps) {
  const content = typeof children === "string" ? children : String(children ?? "");
  const html = marked.parse(content || "");
  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
