import { useEffect, useState } from "react";
import { generateRoadmap, getRoadmap } from "../api";

type RoadmapContent = {
  mvp_features: string[];
  future_iterations: string[];
};

type RoadmapResponse = {
  content: RoadmapContent;
  created_at: string;
};

export default function Roadmap({ projectId }: { projectId: string }) {
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-clear messages after 3s
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  async function fetchRoadmap() {
    try {
      const data = await getRoadmap(projectId);
      setRoadmap(data);
    } catch {
      setRoadmap(null); // no roadmap yet
    }
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const data = await generateRoadmap(projectId);
      setRoadmap(data);
      setSuccessMessage("✅ Roadmap generated successfully!");
    } catch {
      setErrorMessage("❌ Failed to generate roadmap");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoadmap();
  }, [projectId]);

  return (
    <div className="p-4 border rounded mt-4">
      <h2 className="text-xl font-bold mb-2">🗺️ Project Roadmap</h2>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="bg-green-100 text-green-800 p-2 mb-3 rounded">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-100 text-red-800 p-2 mb-3 rounded">
          {errorMessage}
        </div>
      )}

      {!roadmap && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Roadmap"}
        </button>
      )}

      {roadmap && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">🚀 MVP Features</h3>
            <ul className="list-disc ml-6">
              {roadmap.content.mvp_features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold">✨ Future Iterations</h3>
            <ul className="list-disc ml-6">
              {roadmap.content.future_iterations.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>

          {/* Last generated timestamp */}
          <p className="text-sm text-gray-500">
            🕒 Last generated: {new Date(roadmap.created_at).toLocaleString()}
          </p>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-gray-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? "Regenerating..." : "Regenerate Roadmap"}
          </button>
        </div>
      )}
    </div>
  );
}
