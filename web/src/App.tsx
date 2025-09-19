import { useEffect, useState } from "react";
import { getProjects, createProject, updateProject, deleteProject } from "./api";
import ProjectDetail from "./components/ProjectDetail";
import PRDDetail from "./components/PRDDetail";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

function App() {
  const [projects, setProjects] = useState<any[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-clear messages after 3 seconds
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        setErrorMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  // Fetch projects on load
  useEffect(() => {
    setLoading(true);
    getProjects()
      .then((data) => setProjects(data.projects || []))
      .catch(() => setErrorMessage("❌ Failed to fetch projects"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const goals = formData.get("goals") as string;

    try {
      const newProject = await createProject({ title, description, goals });
      setProjects([...projects, newProject]);
      setSuccessMessage("✅ Project created successfully!");
      form.reset();
    } catch {
      setErrorMessage("❌ Failed to create project");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      setSuccessMessage("🗑️ Project deleted successfully!");
    } catch {
      setErrorMessage("❌ Failed to delete project");
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const goals = formData.get("goals") as string;

    try {
      const updated = await updateProject(id, { title, description, goals });
      setProjects(
        projects.map((p) => (p.id === id ? { ...p, ...updated.project } : p))
      );
      setEditingProjectId(null);
      setSuccessMessage("✏️ Project updated successfully!");
    } catch {
      setErrorMessage("❌ Failed to update project");
    }
  }

  return (
    <Router>
      <Routes>
        {/* PRD Detail Screen */}
        <Route path="/projects/:projectId/prds/:prdId" element={<PRDDetail />} />

        {/* Project Detail Screen */}
        <Route path="/projects/:projectId" element={<ProjectDetail />} />

        {/* Project List Screen */}
        <Route
          path="/"
          element={
            <div className="p-6 max-w-3xl mx-auto">
              <h1 className="text-2xl font-bold mb-4">📊 Projects</h1>

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

              {/* Create Project Form */}
              <form
                onSubmit={handleCreate}
                className="mb-6 space-y-2 border p-4 rounded"
              >
                <h2 className="text-lg font-semibold">➕ Create New Project</h2>
                <input
                  name="title"
                  placeholder="Project Title"
                  required
                  className="w-full border p-2 rounded"
                />
                <input
                  name="description"
                  placeholder="Project Description"
                  required
                  className="w-full border p-2 rounded"
                />
                <input
                  name="goals"
                  placeholder="Project Goals"
                  required
                  className="w-full border p-2 rounded"
                />
                <button
                  type="submit"
                  className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Project"}
                </button>
              </form>

              {/* Empty State */}
              {projects.length === 0 && !loading && (
                <p className="text-gray-500 italic">
                  No projects yet. Create one above 🚀
                </p>
              )}

              {/* Project List */}
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li key={p.id} className="border p-3 rounded">
                    {editingProjectId === p.id ? (
                      <form
                        onSubmit={(e) => handleUpdate(e, p.id)}
                        className="space-y-2"
                      >
                        <input
                          name="title"
                          defaultValue={p.title}
                          className="w-full border p-2 rounded"
                        />
                        <input
                          name="description"
                          defaultValue={p.description}
                          className="w-full border p-2 rounded"
                        />
                        <input
                          name="goals"
                          defaultValue={p.goals}
                          className="w-full border p-2 rounded"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="bg-blue-600 text-white px-3 py-1 rounded"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProjectId(null)}
                            className="bg-gray-500 text-white px-3 py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{p.title}</p>
                          <p className="text-sm text-gray-600">
                            {p.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            to={`/projects/${p.id}`}
                            className="bg-blue-600 text-white px-3 py-1 rounded"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => setEditingProjectId(p.id)}
                            className="bg-yellow-600 text-white px-3 py-1 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="bg-red-600 text-white px-3 py-1 rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
