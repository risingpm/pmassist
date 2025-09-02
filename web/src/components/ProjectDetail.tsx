import { useEffect, useState } from "react";
import { getProject } from "../api";
import Roadmap from "./Roadmap";

export default function ProjectDetail({
  projectId,
  onBack,
}: {
  projectId: string;
  onBack: () => void;
}) {
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => setProject(null));
  }, [projectId]);

  if (!project) return <p>Loading project...</p>;

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="mb-4 bg-gray-500 text-white px-3 py-1 rounded"
      >
        ← Back
      </button>

      <h2 className="text-xl font-bold">{project.project.title}</h2>
      <p className="text-gray-600">{project.project.description}</p>
      <p className="text-gray-600 mb-4">🎯 Goals: {project.project.goals}</p>

      {/* Roadmap Feature */}
      <Roadmap projectId={projectId} />
    </div>
  );
}
