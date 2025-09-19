import { useEffect, useState } from "react";
import { createPRD, getPRDs, refinePRD, exportPRD } from "../api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PRD {
  id: string;
  project_id: string;
  feature_name: string;
  content: any;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function PRDTab({ projectId }: { projectId: string }) {
  const [prds, setPrds] = useState<PRD[]>([]);
  const [loading, setLoading] = useState(false);

  const [featureName, setFeatureName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // auto-clear messages
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  useEffect(() => {
    fetchPRDs();
  }, [projectId]);

  const fetchPRDs = async () => {
    try {
      const data = await getPRDs(projectId);
      setPrds(data);
    } catch {
      setErrorMessage("❌ Failed to fetch PRDs");
    }
  };

  const handleGenerate = async () => {
    if (!featureName) {
      setErrorMessage("❌ Please enter a feature name");
      return;
    }
    if (!prompt) {
      setErrorMessage("❌ Please enter some context before generating a PRD");
      return;
    }
    setLoading(true);
    try {
      await createPRD(projectId, featureName, prompt);
      await fetchPRDs();
      setSuccessMessage("✅ PRD generated successfully!");
      setPrompt("");
    } catch {
      setErrorMessage("❌ Failed to generate PRD");
    }
    setLoading(false);
  };

  const handleRefine = async (prdId: string) => {
    if (!instructions) {
      setErrorMessage("❌ Please enter instructions to refine PRD");
      return;
    }
    setLoading(true);
    try {
      await refinePRD(prdId, instructions);
      setInstructions("");
      await fetchPRDs();
      setSuccessMessage("✅ PRD refined successfully!");
    } catch {
      setErrorMessage("❌ Failed to refine PRD");
    }
    setLoading(false);
  };

  const handleExport = async (prdId: string) => {
    try {
      await exportPRD(prdId);
      setSuccessMessage("✅ PRD exported successfully!");
    } catch {
      setErrorMessage("❌ Failed to export PRD");
    }
  };

  // --- Helper: Safe rendering ---
  function renderPRDContent(content: any) {
    if (!content) return null;

    return (
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {typeof content === "string"
            ? content
            : JSON.stringify(content, null, 2)}
        </ReactMarkdown>
      </div>
    );
  }

  // --- Group PRDs by feature ---
  function groupPRDsByFeature(prds: PRD[]) {
    return prds.reduce((acc, prd) => {
      if (!acc[prd.feature_name]) {
        acc[prd.feature_name] = [];
      }
      acc[prd.feature_name].push(prd);
      return acc;
    }, {} as Record<string, PRD[]>);
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">📄 Product Requirements Document</h2>

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

      {/* PRD generator */}
      <div className="space-y-2 mb-6">
        <input
          type="text"
          value={featureName}
          onChange={(e) => setFeatureName(e.target.value)}
          placeholder="Enter feature name (e.g., Notifications, User Profiles)"
          className="w-full border rounded p-2"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter context for PRD generation..."
          className="w-full border rounded p-2"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {loading ? "Generating..." : "Generate PRD"}
        </button>
      </div>

      {/* --- Grouped PRDs by Feature --- */}
      {prds.length > 0 ? (
        <>
          {Object.entries(groupPRDsByFeature(prds)).map(
            ([featureName, featurePRDs]) => (
              <div key={featureName} className="mb-6 border rounded shadow">
                {/* Feature Title */}
                <div className="bg-gray-100 px-4 py-2 font-semibold">
                  {featureName}
                </div>

                {/* PRD Versions */}
                <div className="p-4 space-y-4">
                  {featurePRDs.map((prd) => (
                    <div
                      key={prd.id}
                      className="border p-4 rounded shadow bg-white"
                    >
                      <h3 className="font-semibold mb-2">
                        Version {prd.version} (Created:{" "}
                        {new Date(prd.created_at).toLocaleString()})
                      </h3>
                      <div className="bg-gray-50 p-3 rounded mb-3">
                        {renderPRDContent(prd.content)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRefine(prd.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-green-600 text-white rounded"
                        >
                          {loading ? "Refining..." : "Refine"}
                        </button>
                        <button
                          onClick={() => handleExport(prd.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded"
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </>
      ) : (
        <p className="text-gray-500 italic">No PRDs available yet.</p>
      )}

      {/* Refine Input */}
      <div className="mt-4">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Enter refinement instructions..."
          className="w-full border rounded p-2"
        />
      </div>
    </div>
  );
}
