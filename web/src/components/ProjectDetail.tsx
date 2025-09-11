import React, { useEffect, useState } from "react";
import PRDTab from "./PRD"; // ✅ new import
import { createPRD, getPRDs, refinePRD, exportPRD } from "../api"; // ensures API is available

type Document = {
  id: string;
  filename: string;
  chunk_index: number;
  uploaded_at: string;
  has_embedding: boolean;
};

type Roadmap = {
  existing_features: Record<string, string[]>;
  roadmap: { phase: string; items: string[] }[];
};

type RoadmapResponse = {
  roadmap: Roadmap;
  created_at: string;
};

type ProjectDetailProps = {
  projectId: string;
  onBack: () => void;
};

export default function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [roadmapData, setRoadmapData] = useState<RoadmapResponse | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // ✅ NEW: Tab state
  const [activeTab, setActiveTab] = useState<"documents" | "roadmap" | "prd">("documents");

  // ---- DOCUMENTS ----
  const fetchDocuments = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}`);
    const data = await res.json();
    setDocuments(data);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}`, {
      method: "POST",
      body: formData,
    });

    setFile(null);
    await fetchDocuments();
    setLoading(false);
  };

  const handleEmbed = async () => {
    setLoading(true);
    await fetch(`${import.meta.env.VITE_API_BASE}/documents/embed/${projectId}`, {
      method: "POST",
    });
    await fetchDocuments();
    setLoading(false);
  };

  const handleDelete = async (docId: string) => {
    await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}/${docId}`, {
      method: "DELETE",
    });
    await fetchDocuments();
  };

  // ---- ROADMAP ----
  const fetchRoadmap = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/roadmap-ai/${projectId}`);
    const data = await res.json();
    if (data.roadmap) {
      setRoadmapData(data);
    } else {
      setRoadmapData(null);
    }
  };

  const handleGenerateRoadmap = async () => {
    setRoadmapLoading(true);
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/roadmap-ai/${projectId}`, {
      method: "POST",
    });
    const data = await res.json();

    if (data.roadmap) {
      setRoadmapData(data);
    } else {
      setRoadmapData(null);
    }

    setRoadmapLoading(false);
  };

  // ---- EFFECT ----
  useEffect(() => {
    fetchDocuments();
    fetchRoadmap();
  }, [projectId]);

  // ---- UI ----
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 bg-gray-600 text-white rounded"
      >
        🔙 Back to Projects
      </button>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          className={`px-4 py-2 ${
            activeTab === "documents" ? "border-b-2 border-blue-600 font-semibold" : ""
          }`}
          onClick={() => setActiveTab("documents")}
        >
          📄 Documents
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === "roadmap" ? "border-b-2 border-blue-600 font-semibold" : ""
          }`}
          onClick={() => setActiveTab("roadmap")}
        >
          🛣️ Roadmap
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === "prd" ? "border-b-2 border-blue-600 font-semibold" : ""
          }`}
          onClick={() => setActiveTab("prd")}
        >
          📑 PRD
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "documents" && (
        <>
          <h1 className="text-2xl font-bold mb-6">📄 Project Documents</h1>
          {/* Document Upload + List */}
          <div className="flex gap-2 mb-4">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2 rounded w-full"
            />
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? "Uploading..." : "Upload"}
            </button>
          </div>

          <button
            onClick={handleEmbed}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded mb-6 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Generate Embeddings"}
          </button>

          {documents.length === 0 ? (
            <p className="text-gray-500 italic">No documents uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="border p-3 rounded bg-gray-50 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">
                      {doc.filename} (chunk {doc.chunk_index})
                    </p>
                    <p className="text-sm text-gray-600">
                      Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
                    </p>
                    <p className="text-sm">
                      Embedding:{" "}
                      <span
                        className={
                          doc.has_embedding ? "text-green-600" : "text-red-600"
                        }
                      >
                        {doc.has_embedding ? "✅ Yes" : "❌ No"}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {activeTab === "roadmap" && (
        <>
          <h1 className="text-2xl font-bold mb-6">🛣️ AI Roadmap</h1>
          <button
            onClick={handleGenerateRoadmap}
            disabled={roadmapLoading}
            className="bg-purple-600 text-white px-4 py-2 rounded mb-6 disabled:opacity-50"
          >
            {roadmapLoading ? "Regenerating..." : "Generate / Regenerate AI Roadmap"}
          </button>

          {roadmapData && (
            <div className="border p-4 rounded bg-gray-50">
              <p className="text-sm text-gray-500">
                Last generated: {new Date(roadmapData.created_at).toLocaleString()}
              </p>
              <h2 className="text-lg font-semibold mt-4">✨ Existing Features</h2>
              {Object.keys(roadmapData.roadmap.existing_features).length === 0 ? (
                <p className="text-gray-500 italic">No features found.</p>
              ) : (
                <ul className="list-disc ml-6 text-sm text-gray-700">
                  {Object.entries(roadmapData.roadmap.existing_features).map(
                    ([category, features]) => (
                      <li key={category}>
                        <p className="font-medium">{category}</p>
                        <ul className="ml-4 list-disc">
                          {features.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </li>
                    )
                  )}
                </ul>
              )}

              <h2 className="text-lg font-semibold mt-4">🛠️ Roadmap Phases</h2>
              {roadmapData.roadmap.roadmap.length === 0 ? (
                <p className="text-gray-500 italic">No roadmap phases generated.</p>
              ) : (
                <ul className="list-disc ml-6 text-sm text-gray-700">
                  {roadmapData.roadmap.roadmap.map((phase, i) => (
                    <li key={i}>
                      <p className="font-medium">{phase.phase}</p>
                      <ul className="ml-4 list-disc">
                        {phase.items.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "prd" && (
        <>
          <PRDTab projectId={projectId} />
        </>
      )}
    </div>
  );
}
