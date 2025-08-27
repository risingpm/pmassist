import { useEffect, useState } from "react";
import { createProject, getProjects, updateProject, deleteProject } from "./api";

function App() {
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", description: "", goals: "" });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    getProjects().then((data) => setProjects(data.projects));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const updated = await updateProject(editingId, form);
      setProjects(
        projects.map((p) => (p.id === editingId ? { id: updated.id, ...updated.project } : p))
      );
      setEditingId(null);
    } else {
      const newProj = await createProject(form);
      setProjects([...projects, { id: newProj.id, ...newProj.project }]);
    }
    setForm({ title: "", description: "", goals: "" });
  };

  const handleEdit = (p: any) => {
    setForm({ title: p.title, description: p.description, goals: p.goals });
    setEditingId(p.id);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setProjects(projects.filter((p) => p.id !== id));
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Projects</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          placeholder="Goals"
          value={form.goals}
          onChange={(e) => setForm({ ...form, goals: e.target.value })}
        />
        <button type="submit">{editingId ? "Update Project" : "Create Project"}</button>
      </form>

      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <strong>{p.title}</strong>: {p.description} ({p.goals}){" "}
            <button onClick={() => handleEdit(p)}>Edit</button>{" "}
            <button onClick={() => handleDelete(p.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
