import { useEffect, useState } from "react";
import { createPRD, getPRDs, refinePRD, exportPRD } from "../api";

interface PRD {
  id: string;
  project_id: string;
  content: any;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function PRDTab({ projectId }: { projectId: string }) {
  const [prds, setPrds] = useState<PRD[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ For PRD Generation
  const [prompt, setPrompt] = useState("");

  // ✅ For Refinement
  const [instructions, setInstructions] = useState("");

  // ✅ Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-clear messages after 3 sec
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
    if (!prompt) {
      setErrorMessage("❌ Please enter some context before generating a PRD");
      return;
    }
    setLoading(true);
    try {
      await createPRD(projectId, prompt);
      await fetchPRDs();
      setSuccessMessage("✅ PRD generated successfully!");
      setPrompt(""); // reset after use
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

  // ✅ Helper to render structured PRD content
  function renderPRDContent(content: any) {
    return (
      <div className="space-y-4">
        {content.objective && (
          <div>
            <h4 className="font-semibold text-lg mb-1">🎯 Objective</h4>
            <p className="text-gray-700">{content.objective}</p>
          </div>
        )}

        {content.scope && (
          <div>
            <h4 className="font-semibold text-lg mb-1">📦 Scope</h4>
            {content.scope.in_scope && (
              <>
                <p className="font-medium">✅ In Scope:</p>
                <ul className="list-disc ml-6 text-gray-700">
                  {content.scope.in_scope.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            {content.scope.out_of_scope && (
              <>
                <p className="font-medium mt-2">❌ Out of Scope:</p>
                <ul className="list-disc ml-6 text-gray-700">
                  {content.scope.out_of_scope.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {content.success_metrics && (
          <div>
            <h4 className="font-semibold text-lg mb-1">📊 Success Metrics</h4>
            <ul className="list-disc ml-6 text-gray-700">
              {Object.entries(content.success_metrics).map(([k, v], i) => (
                <li key={i}>
                  <span className="font-medium">{k}:</span> {v as string}
                </li>
              ))}
            </ul>
          </div>
        )}

        {content.engineering_requirements && (
          <div>
            <h4 className="font-semibold text-lg mb-1">🛠️ Engineering Requirements</h4>
            {typeof content.engineering_requirements === "object" ? (
              <ul className="list-disc ml-6 text-gray-700">
                {Object.entries(content.engineering_requirements).map(([k, v], i) => (
                  <li key={i}>
                    <span className="font-medium">{k}:</span>{" "}
                    {Array.isArray(v) ? v.join(", ") : (v as string)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-700">{content.engineering_requirements}</p>
            )}
          </div>
        )}

        {content.future_work && (
          <div>
            <h4 className="font-semibold text-lg mb-1">🚀 Future Work</h4>
            <ul className="list-disc ml-6 text-gray-700">
              {content.future_work.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">📑 Product Requirements Document</h2>

      {/* ✅ Success/Error Messages */}
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

      {prds.length === 0 ? (
        // ------------------
        // ✅ GENERATE PRD
        // ------------------
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter context for PRD generation (e.g. focus on UX, add mobile support)..."
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
      ) : (
        <>
          <div className="space-y-4">
            {prds.map((prd) => (
              <div
                key={prd.id}
                className="border p-4 rounded shadow bg-white"
              >
                <h3 className="font-semibold mb-2">Version {prd.version}</h3>
                <div className="bg-gray-50 p-4 rounded">
                  {renderPRDContent(prd.content)}
                </div>
                <div className="mt-2 flex gap-2">
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
                    Export to .docx
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ------------------ */}
          {/* ✅ REFINEMENT BOX */}
          {/* ------------------ */}
          <div className="mt-4">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter refinement instructions..."
              className="w-full border rounded p-2"
            />
          </div>
        </>
      )}
    </div>
  );
}
