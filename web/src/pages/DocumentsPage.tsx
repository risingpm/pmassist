import React, { useState, useEffect } from "react";

type Document = {
  id: string;
  filename: string;
  chunk_index: number;
  uploaded_at: string;
  has_embedding: boolean;
};

export default function DocumentsPage() {
  const [projectId, setProjectId] = useState(""); 
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch docs list
  const fetchDocuments = async () => {
    if (!projectId) return;
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/documents/${projectId}`);
    const data = await res.json();
    setDocuments(data);
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file || !projectId) return;
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

  // Trigger embeddings
  const handleEmbed = async () => {
    if (!projectId) return;
    setLoading(true);

    await fetch(`${import.meta.env.VITE_API_BASE}/documents/embed/${projectId}`, {
      method: "POST",
    });

    await fetchDocuments();
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📄 Project Documents</h1>

      {/* Project ID input for now */}
      <input
        type="text"
        placeholder="Enter Project ID"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="border p-2 rounded w-full mb-4"
      />

      {/* File Upload */}
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

      {/* Embed button */}
      <button
        onClick={handleEmbed}
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 rounded mb-4 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Generate Embeddings"}
      </button>

      {/* Documents List */}
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="border p-3 rounded bg-gray-50">
            <p className="font-medium">{doc.filename} (chunk {doc.chunk_index})</p>
            <p className="text-sm text-gray-600">
              Uploaded: {new Date(doc.uploaded_at).toLocaleString()}
            </p>
            <p className="text-sm">
              Embedding:{" "}
              <span className={doc.has_embedding ? "text-green-600" : "text-red-600"}>
                {doc.has_embedding ? "✅ Yes" : "❌ No"}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
