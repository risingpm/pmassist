    import { useEffect, useState } from "react";
    import { useParams, useNavigate } from "react-router-dom";
    import { refinePRD, exportPRD, getPRDs } from "../api";
    import ReactMarkdown from "react-markdown";
    import remarkGfm from "remark-gfm";

    interface PRD {
    id: string;
    project_id: string;
    feature_name: string;
    content: any;
    version: number;
    created_at: string;
    }

    export default function PRDDetail() {
    const { projectId, prdId } = useParams();
    const navigate = useNavigate();
    const [prd, setPrd] = useState<PRD | null>(null);
    const [loading, setLoading] = useState(false);
    const [instructions, setInstructions] = useState("");

    useEffect(() => {
        fetchPRD();
    }, [projectId, prdId]);

    const fetchPRD = async () => {
        const data = await getPRDs(projectId!);
        const match = data.find((p: PRD) => p.id === prdId);
        setPrd(match || null);
    };

    const handleRefine = async () => {
        if (!instructions) return;
        setLoading(true);
        await refinePRD(prdId!, instructions);
        await fetchPRD();
        setInstructions("");
        setLoading(false);
    };

    const handleExport = async () => {
        await exportPRD(prdId!);
    };

    if (!prd) {
        return <p className="p-4 text-gray-500">Loading PRD...</p>;
    }

    return (
        <div className="p-4 max-w-3xl mx-auto">
        <button
            onClick={() => navigate(-1)}
            className="mb-4 px-3 py-1 bg-gray-200 rounded"
        >
            ← Back
        </button>

        <h2 className="text-2xl font-bold mb-2">{prd.feature_name}</h2>
        <p className="text-gray-600 mb-4">
            Version {prd.version} – Created {new Date(prd.created_at).toLocaleString()}
        </p>

        <div className="bg-gray-50 p-4 rounded mb-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {typeof prd.content === "string"
                ? prd.content
                : JSON.stringify(prd.content, null, 2)}
            </ReactMarkdown>
        </div>

        <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter refinement instructions..."
            className="w-full border rounded p-2 mb-3"
        />
        <div className="flex gap-2">
            <button
            onClick={handleRefine}
            disabled={loading}
            className="px-3 py-1 bg-green-600 text-white rounded"
            >
            {loading ? "Refining..." : "Refine"}
            </button>
            <button
            onClick={handleExport}
            className="px-3 py-1 bg-purple-600 text-white rounded"
            >
            Export
            </button>
        </div>
        </div>
    );
    }
