import React, { useEffect, useMemo, useState } from "react";
import SafeMarkdown from "./SafeMarkdown";
import PRDList from "./PRDList";
import PRDDetail from "./PRDDetail";
import {
  getProject,
  fetchRoadmap as fetchSavedRoadmap,
  generateRoadmapChat,
  updateRoadmap,
  type ChatMessage,
} from "../api";

const makeId = () => Math.random().toString(36).slice(2, 10);

type Document = {
  id: string;
  filename: string;
  chunk_index: number;
  uploaded_at: string;
  has_embedding: boolean;
};

type ProjectDetailProps = {
  projectId: string;
  onBack: () => void;
};

type ConversationEntry = ChatMessage & { id: string };

type RoadmapPreview = {
  content: string;
  updated_at: string;
};

export default function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [projectInfo, setProjectInfo] = useState<{
    title: string;
    description: string;
    goals: string;
    north_star_metric?: string | null;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"documents" | "roadmap" | "prd">(
    "documents"
  );
  const [selectedPrd, setSelectedPrd] = useState<{
    projectId: string;
    prdId: string;
  } | null>(null);

  // Roadmap interaction state
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [promptInput, setPromptInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [roadmapPreview, setRoadmapPreview] = useState<RoadmapPreview | null>(null);
  const [isEditingRoadmap, setIsEditingRoadmap] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingRoadmap, setSavingRoadmap] = useState(false);

  const resetConversation = () => {
    setConversation([]);
    setPromptInput("");
    setGenerateError(null);
  };

  // ------------------- Document handlers -------------------
  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/documents/${projectId}`
      );
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoadingDocs(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}`, {
        method: "POST",
        body: formData,
      });
      setFile(null);
      await fetchDocuments();
    } catch (err) {
      console.error("Failed to upload document", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleEmbed = async () => {
    setLoadingDocs(true);
    try {
      await fetch(`${import.meta.env.VITE_API_BASE}/documents/embed/${projectId}`, {
        method: "POST",
      });
      await fetchDocuments();
    } catch (err) {
      console.error("Failed to trigger embeddings", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}/${docId}`, {
        method: "DELETE",
      });
      await fetchDocuments();
    } catch (err) {
      console.error("Failed to delete document", err);
    }
  };

  const groupedDocuments = useMemo(
    () => [...new Map(documents.map((d) => [d.filename, d])).values()],
    [documents]
  );

  // ------------------- Roadmap handlers -------------------
  const loadRoadmap = async () => {
    try {
      const data = await fetchSavedRoadmap(projectId);
      setRoadmapPreview({ content: data.content, updated_at: data.updated_at });
    } catch {
      setRoadmapPreview(null);
    }
  };

  const handleGenerateRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = promptInput.trim();
    if (!prompt) {
      setGenerateError(
        conversation.length === 0
          ? "Describe what you need from the roadmap."
          : "Please provide a reply before continuing."
      );
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const historyPayload: ChatMessage[] = conversation.map(({ role, content }) => ({
        role,
        content,
      }));
      const response = await generateRoadmapChat(projectId, prompt, historyPayload);

      const nextConversation: ConversationEntry[] = response.conversation_history.map(
        (msg) => ({ ...msg, id: makeId() })
      );
      setConversation(nextConversation);
      setPromptInput("");

      if (response.roadmap) {
        await loadRoadmap();
      }
    } catch (err: any) {
      console.error(err);
      setGenerateError(err.message || "Failed to generate roadmap.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartNewConversation = () => {
    resetConversation();
  };

  const handleStartEditingRoadmap = () => {
    if (!roadmapPreview) return;
    setEditContent(roadmapPreview.content);
    setIsEditingRoadmap(true);
    setSaveMessage(null);
  };

  const handleCancelEditingRoadmap = () => {
    setIsEditingRoadmap(false);
    setSaveMessage(null);
  };

  const handleSaveRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRoadmap(true);
    setSaveMessage(null);
    try {
      await updateRoadmap(projectId, editContent);
      setSaveMessage("Roadmap updated.");
      setIsEditingRoadmap(false);
      await loadRoadmap();
    } catch (err: any) {
      console.error(err);
      setSaveMessage(err.message || "Failed to save roadmap.");
    } finally {
      setSavingRoadmap(false);
    }
  };

  // ------------------- Lifecycle -------------------
  useEffect(() => {
    const fetchProjectInfo = async () => {
      try {
        const data = await getProject(projectId);
        setProjectInfo({
          title: data.project.title,
          description: data.project.description,
          goals: data.project.goals,
          north_star_metric: data.project.north_star_metric,
        });
      } catch (err) {
        console.error("Failed to load project info", err);
      }
    };

    fetchProjectInfo();
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
    loadRoadmap();
  }, [projectId]);

  // ------------------- Render -------------------
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <button
          onClick={onBack}
          className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          ⬅ Back to Projects
        </button>

        {projectInfo && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-bold text-slate-900">{projectInfo.title}</h1>
            <p className="mt-3 text-slate-600">{projectInfo.description}</p>
            <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <p className="font-semibold text-slate-700">Goals</p>
                <p className="mt-1 leading-relaxed">{projectInfo.goals}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">North Star Metric</p>
                <p className="mt-1">
                  {projectInfo.north_star_metric || "Not specified"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex gap-6 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-500">
          <button
            onClick={() => setActiveTab("documents")}
            className={
              activeTab === "documents"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Documents
          </button>
          <button
            onClick={() => setActiveTab("roadmap")}
            className={
              activeTab === "roadmap"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            Roadmap
          </button>
          <button
            onClick={() => setActiveTab("prd")}
            className={
              activeTab === "prd"
                ? "border-b-2 border-blue-600 pb-2 text-blue-600"
                : "pb-2 hover:text-slate-700"
            }
          >
            PRDs
          </button>
        </div>

        {activeTab === "documents" && (
          <section className="mt-6 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Project Documents</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload supporting artefacts to improve roadmap and PRD quality.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
                <button
                  onClick={handleUpload}
                  disabled={loadingDocs}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {loadingDocs ? "Uploading..." : "Upload"}
                </button>
                <button
                  onClick={handleEmbed}
                  disabled={loadingDocs}
                  className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  Embed
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800">Uploaded Files</h3>
              {groupedDocuments.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No documents uploaded yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {groupedDocuments.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-800">{doc.filename}</p>
                        <p className="text-xs text-slate-500">
                          Uploaded {new Date(doc.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-sm font-semibold text-rose-500 transition hover:text-rose-600"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === "roadmap" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900">AI Roadmap</h2>
                  {roadmapPreview && !isEditingRoadmap && (
                    <button
                      onClick={handleStartEditingRoadmap}
                      className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      Update roadmap
                    </button>
                  )}
                </div>

                {isEditingRoadmap ? (
                  <form onSubmit={handleSaveRoadmap} className="mt-4 space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={12}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="flex items-center justify-end gap-3 text-sm">
                      <button
                        type="button"
                        onClick={handleCancelEditingRoadmap}
                        className="rounded-full bg-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingRoadmap}
                        className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingRoadmap ? "Saving..." : "Save"}
                      </button>
                    </div>
                    {saveMessage && (
                      <p className="text-xs text-slate-500">{saveMessage}</p>
                    )}
                  </form>
                ) : roadmapPreview ? (
                  <div className="mt-4 space-y-4 text-sm text-slate-700">
                    <SafeMarkdown>
                      {typeof roadmapPreview.content === "string"
                        ? roadmapPreview.content
                        : JSON.stringify(roadmapPreview.content ?? "", null, 2)}
                    </SafeMarkdown>
                    <p className="text-xs text-slate-400">
                      Last updated {new Date(roadmapPreview.updated_at).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    No roadmap saved yet. Start a conversation with the assistant.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">
                  AI roadmap assistant
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Start with a prompt, answer any follow-up questions, and review the roadmap
                  preview as the assistant refines it.
                </p>

                <div className="mt-4 h-64 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  {conversation.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No messages yet. Provide a prompt to begin.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {conversation.map((msg) => (
                        <li
                          key={msg.id}
                          className={
                            msg.role === "user"
                              ? "ml-auto max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2 text-sm text-white"
                              : "max-w-[85%] rounded-2xl bg-white px-4 py-2 text-sm text-slate-700 shadow"
                          }
                        >
                          <span className="block whitespace-pre-wrap">{msg.content}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {generateError && (
                  <p className="mt-3 text-sm text-rose-500">{generateError}</p>
                )}

                <form onSubmit={handleGenerateRoadmap} className="mt-4 space-y-3">
                  <textarea
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder={
                      conversation.length === 0
                        ? "Describe the initiative or strategic question you want the roadmap to cover"
                        : "Reply to the assistant..."
                    }
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    disabled={isGenerating}
                  />
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Conversation length: {conversation.length} message{conversation.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="submit"
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                      disabled={isGenerating}
                    >
                      {isGenerating ? "Thinking..." : "Generate roadmap"}
                    </button>
                  </div>
                </form>

                {conversation.length > 0 && !isGenerating && (
                  <button
                    onClick={handleStartNewConversation}
                    className="mt-3 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
                  >
                    Start a new conversation
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "prd" && (
          <section className="mt-6">
            {!selectedPrd ? (
              <PRDList
                projectId={projectId}
                onSelectPrd={(projId, id) =>
                  setSelectedPrd({ projectId: projId, prdId: id })
                }
                onBack={() => setActiveTab("documents")}
              />
            ) : (
              <PRDDetail
                projectId={selectedPrd.projectId}
                prdId={selectedPrd.prdId}
                onBack={() => setSelectedPrd(null)}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
