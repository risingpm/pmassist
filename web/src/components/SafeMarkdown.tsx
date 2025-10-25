import React from "react";
import ReactMarkdown from "react-markdown";

interface SafeMarkdownProps {
  children: string;
}

type BoundaryState = {
  hasError: boolean;
  errorMessage?: string;
};

class MarkdownBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("Failed to render markdown", error);
  }

  componentDidUpdate(prevProps: Readonly<{ fallback: React.ReactNode; children: React.ReactNode }>) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function SafeMarkdown({ children }: SafeMarkdownProps) {
  const content = typeof children === "string" ? children : String(children ?? "");
  return (
    <MarkdownBoundary
      fallback={
        <pre className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap">
          {content}
        </pre>
      }
    >
      <ReactMarkdown className="prose prose-sm max-w-none">{content}</ReactMarkdown>
    </MarkdownBoundary>
  );
}
