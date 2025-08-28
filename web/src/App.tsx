import { useEffect, useState, useRef } from "react";
import { createProject, getProjects, updateProject, deleteProject } from "./api";

// Reusable Spinner Component
function Spinner() {
  return (
    <div className="flex justify-center items-center">
      <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

function App() {
  // State: list of projects
  const [projects, setProjects] = useState<any[]>([]);

  // State: form fields
  const [form, setForm] = useState({ title: "", description: "", goals: "" });

  // State: track if editing a project
  const [editingId, setEditingId] = useState<string | null>(null);

  // State: messages for user feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State: loading indicators
  const [loading, setLoading] = useState(false); // for form actions
  const [loadingProjects, setLoadingProjects] = useState(true); // for fetching projects

  // Ref: used to auto-focus the title input when needed
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Fetch projects on first render
  useEffect(() => {
    setLoadingProjects(true);
    getProjects()
      .then((data) => setProjects(data.projects))
      .catch(() => {
        setErrorMessage("❌ Failed to load projects");
        setTimeout(() => setErrorMessage(null), 3000);
      })
      .finally(() => setLoadingProjects(false));
  }, []);

  // Handle form submit → create or update project
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingId) {
        const updated = await updateProject(editingId, form);
        setProjects(
          projects.map((p) =>
            p.id === editingId ? { id: updated.id, ...updated.project } : p
          )
        );
        setEditingId(null);
        setSuccessMessage("✅ Project updated successfully");
      } else {
        const newProj = await createProject(form);
        setProjects([...projects, { id: newProj.id, ...newProj.project }]);
        setSuccessMessage("✅ Project created successfully");
      }

      setForm({ title: "", description: "", goals: "" });
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage("❌ Failed to save project");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Handle edit → load project into form
  const handleEdit = (p: any) => {
    setForm({ title: p.title, description: p.description, goals: p.goals });
    setEditingId(p.id);
    titleInputRef.current?.focus();
  };

  // Handle delete → remove project
  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      setSuccessMessage("🗑️ Project deleted successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage("❌ Failed to delete project");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1 className="text-3xl font-bold mb-4">Projects</h1>

      {/* Project Form */}
      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-3">
        <input
          ref={titleInputRef}
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="border rounded px-3 py-2"
          disabled={loading}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border rounded px-3 py-2"
          disabled={loading}
        />
        <input
          placeholder="Goals"
          value={form.goals}
          onChange={(e) => setForm({ ...form, goals: e.target.value })}
          className="border rounded px-3 py-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className={`flex justify-center items-center gap-2 ${
            loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
          } text-white py-2 px-4 rounded transition`}
        >
          {loading ? <Spinner /> : editingId ? "Update Project" : "Create Project"}
        </button>
      </form>

      {/* Success + Error Messages */}
      {successMessage && (
        <div className="mb-4 text-green-600 font-medium">{successMessage}</div>
      )}
      {errorMessage && (
        <div className="mb-4 text-red-600 font-medium">{errorMessage}</div>
      )}

      {/* Loading State for Projects */}
      {loadingProjects ? (
        <div className="flex flex-col items-center gap-2 text-gray-500">
          <Spinner />
          <div>Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        /* Empty State Handling */
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg shadow-sm">
          <div className="text-2xl font-semibold mb-2">📂 No projects yet</div>
          <div className="text-gray-500 mb-6">
            Start by creating your first one.
          </div>
          <button
            onClick={() => {
              setForm({ title: "", description: "", goals: "" });
              titleInputRef.current?.focus();
            }}
            className="px-6 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Create Project
          </button>
        </div>
      ) : (
        /* Project List */
        <ul className="space-y-3">
          {projects.map((p) => (
            <li
              key={p.id}
              className="p-4 border rounded-lg shadow-sm flex justify-between items-center"
            >
              <div>
                <strong>{p.title}</strong>: {p.description} ({p.goals})
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => handleEdit(p)}
                  disabled={loading}
                  className="px-3 py-1 bg-yellow-400 text-black rounded hover:bg-yellow-500 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
