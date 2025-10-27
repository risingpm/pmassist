import { useEffect, useMemo, useState } from "react";

import SafeMarkdown from "./SafeMarkdown";
import {
  fetchRoadmap,
  generateRoadmapChat,
  type ChatMessage,
} from "../api";
import { AUTH_USER_KEY, USER_ID_KEY, WORKSPACE_ID_KEY } from "../constants";

const DEFAULT_PROMPT =
  "Generate a roadmap that highlights MVP features and future iterations for this project.";

function coerceRoadmapContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

export default function Roadmap({ projectId }: { projectId: string }) {
  const [roadmapMarkdown, setRoadmapMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const workspaceId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(WORKSPACE_ID_KEY);
  }, []);

  const userId = useMemo(() => {
    if (typeof window === "undefined") return null;

    const storedAuth = window.sessionStorage.getItem(AUTH_USER_KEY);
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth) as { id?: string };
        if (parsed?.id) {
          return parsed.id;
        }
      } catch {
        // ignore parsing failure and fall back to explicit key
      }
    }

    return window.sessionStorage.getItem(USER_ID_KEY);
  }, []);

  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = window.setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [successMessage, errorMessage]);

  const loadRoadmap = async () => {
    if (!workspaceId) {
      setRoadmapMarkdown(null);
      setErrorMessage("Workspace context missing. Select a workspace and try again.");
      return;
    }

    try {
      const data = await fetchRoadmap(projectId, workspaceId);
      setRoadmapMarkdown(coerceRoadmapContent(data.content));
      setErrorMessage(null);
    } catch (err) {
      console.warn("No roadmap available", err);
      setRoadmapMarkdown(null);
    }
  };

  const handleGenerate = async () => {
    if (!workspaceId) {
      setErrorMessage("Workspace context missing. Select a workspace and try again.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const conversation: ChatMessage[] = [];

    try {
      const response = await generateRoadmapChat(
        projectId,
        DEFAULT_PROMPT,
        conversation,
        userId ?? undefined,
        workspaceId
      );

      if (response.action === "ask_followup") {
        setErrorMessage(response.message || "The assistant needs more context before drafting a roadmap.");
        setSuccessMessage(null);
      } else {
        setSuccessMessage("✅ Roadmap generated successfully!");
        await loadRoadmap();
      }
    } catch (err) {
      console.error("Failed to generate roadmap", err);
      setErrorMessage("❌ Failed to generate roadmap");
      setSuccessMessage(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoadmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspaceId]);

  const hasRoadmap = Boolean(roadmapMarkdown && roadmapMarkdown.trim().length > 0);

  return (
    <div className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Project Roadmap</h2>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Generating…" : hasRoadmap ? "Regenerate" : "Generate"}
        </button>
      </div>

      {successMessage && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600">
          {errorMessage}
        </div>
      )}

      {hasRoadmap ? (
        <div className="prose prose-sm max-w-none">
          <SafeMarkdown>{roadmapMarkdown ?? ""}</SafeMarkdown>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {workspaceId
            ? "No roadmap saved yet. Generate one to kick things off."
            : "Select a workspace to view this project's roadmap."}
        </p>
      )}
    </div>
  );
}
