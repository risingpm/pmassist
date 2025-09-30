import React, { useEffect, useState } from "react";
import PRDList from "./PRDList";
import PRDDetail from "./PRDDetail";

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

  const [activeTab, setActiveTab] = useState<"documents" | "roadmap" | "prd">("documents");
  const [selectedPrd, setSelectedPrd] = useState<{ projectId: string; prdId: string } | null>(null);

  // --- Document handlers ---
  const fetchDocuments = async () => {
    console.log("Fetching documents for project", projectId);
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}`);
    const data = await res.json();
    console.log("Documents response:", data);
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

  // --- Roadmap handlers ---
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

  // --- Lifecycle ---
  useEffect(() => {
    fetchDocuments();
    fetchRoadmap();
  }, [projectId]);

  // --- UI ---
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 bg-gray-600 text-white rounded"
      >
        ⬅ Back to Projects
      </button>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          className={`px-4 py-2 ${activeTab === "documents" ? "border-b-2 border-blue-600 font-semibold" : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          📄 Documents
        </button>
        <button
          className={`px-4 py-2 ${activeTab === "roadmap" ? "border-b-2 border-blue-600 font-semibold" : ""}`}
          onClick={() => setActiveTab("roadmap")}
        >
          🛠 Roadmap
        </button>
        <button
          className={`px-4 py-2 ${activeTab === "prd" ? "border-b-2 border-blue-600 font-semibold" : ""}`}
          onClick={() => setActiveTab("prd")}
        >
          📑 PRDs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "documents" && (
        <div>
          <h1 className="text-2xl font-bold mb-6">📄 Project Documents</h1>

          {/* Upload + Embed */}
          <div className="flex items-center gap-2 mb-4">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button
              onClick={handleUpload}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {loading ? "Uploading..." : "Upload"}
            </button>
            <button
              onClick={handleEmbed}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              Embed
            </button>
          </div>

          {/* Document List (grouped by filename) */}
          {documents.length === 0 ? (
            <p className="text-gray-500">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {[...new Map(documents.map((d) => [d.filename, d])).values()].map((doc) => (
                <li key={doc.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <p className="font-medium">{doc.filename}</p>
                    <p className="text-sm text-gray-500">
                      Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="px-2 py-1 bg-red-500 text-white rounded"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "roadmap" && (
        <div>
          <h1 className="text-2xl font-bold mb-6">🛠 AI Roadmap</h1>

          <button
            onClick={handleGenerateRoadmap}
            disabled={roadmapLoading}
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {roadmapLoading ? "Generating..." : "Generate Roadmap"}
          </button>

          {roadmapData ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Phases</h2>
              {roadmapData.roadmap.roadmap.map((phase, idx) => (
                <div key={idx} className="p-2 border rounded">
                  <h3 className="font-bold">{phase.phase}</h3>
                  <ul className="list-disc list-inside">
                    {phase.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No roadmap yet. Generate one above.</p>
          )}
        </div>
      )}

      {activeTab === "prd" && (
        <>
          {!selectedPrd ? (
            <PRDList
              projectId={projectId}
              onSelectPrd={(projId, id) => setSelectedPrd({ projectId: projId, prdId: id })}
              onBack={() => setActiveTab("documents")}
            />
          ) : (
            <PRDDetail
              projectId={selectedPrd.projectId}
              prdId={selectedPrd.prdId}
              onBack={() => setSelectedPrd(null)}
            />
          )}
        </>
      )}
    </div>
  );
}