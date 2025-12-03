import { marked } from "marked";

interface SafeMarkdownProps {
  children: string;
  className?: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function SafeMarkdown({ children, className = "" }: SafeMarkdownProps) {
  const content = typeof children === "string" ? children : String(children ?? "");
  const html = marked.parse(content || "");
  return <div className={`markdown-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
