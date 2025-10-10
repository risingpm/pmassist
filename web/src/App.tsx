import { useEffect, useMemo, useState } from "react";
import { getProjects, createProject, deleteProject } from "./api";
import ProjectDetail from "./components/ProjectDetail";

type Project = {
  id: string;
  title: string;
  description: string;
  goals: string;
  north_star_metric?: string | null;
};

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    setLoading(true);
    getProjects()
      .then((data) => setProjects(data.projects || []))
      .catch(() => setErrorMessage("❌ Failed to fetch projects"))
      .finally(() => setLoading(false));
  }, []);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.title.localeCompare(b.title)),
    [projects]
  );

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const title = (formData.get("title") as string).trim();
    const description = (formData.get("description") as string).trim();
    const goals = (formData.get("goals") as string).trim();
    const northStarMetric = ((formData.get("north_star_metric") as string) || "").trim();

    if (!title || !description || !goals) {
      setErrorMessage("Please fill in title, description, and goals.");
      return;
    }

    try {
      const created = await createProject({
        title,
        description,
        goals,
        north_star_metric: northStarMetric || null,
      });
      setProjects((prev) => [...prev, { id: created.id, ...created.project }]);
      setSuccessMessage("✅ Project created successfully!");
      setShowCreate(false);
      form.reset();
    } catch (err) {
      console.error(err);
      setErrorMessage("❌ Failed to create project");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setSuccessMessage("🗑️ Project deleted successfully!");
    } catch (err) {
      console.error(err);
      setErrorMessage("❌ Failed to delete project");
    }
  }

  if (selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-600">
              PM
            </div>
            <span className="text-lg font-semibold">PM Assist</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 md:flex">
            <span className="cursor-not-allowed opacity-30">Dashboard</span>
            <span className="text-blue-600">Projects</span>
            <span className="cursor-not-allowed opacity-30">Analytics</span>
          </nav>
          <div className="h-10 w-10 rounded-full bg-slate-200" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold">Projects</h1>
            <p className="mt-2 text-base text-slate-500">
              Manage all your product initiatives here.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <span className="text-lg leading-none">＋</span>
            New Project
          </button>
        </div>

        {(successMessage || errorMessage) && (
          <div className="mb-6 space-y-2">
            {successMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow-sm">
                {successMessage}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow-sm">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-12 text-center text-slate-500">
            Loading projects...
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center text-slate-500">
            No projects yet. Click “New Project” to get started.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sortedProjects.map((project) => (
              <article
                key={project.id}
                className="flex h-full flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] transition hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(15,23,42,0.4)]"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {project.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-4">
                    {project.description}
                  </p>
                </div>
                <div className="mt-6 space-y-3 text-sm">
                  <div className="rounded-2xl bg-blue-50 px-4 py-3 text-blue-800">
                    <p className="font-semibold text-blue-700">Goals</p>
                    <p className="mt-1 leading-relaxed">{project.goals}</p>
                  </div>
                  {project.north_star_metric && (
                    <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-600">
                      <p className="font-semibold text-slate-700">North Star Metric</p>
                      <p className="mt-1 leading-relaxed">{project.north_star_metric}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <button
                      onClick={() => setSelectedProjectId(project.id)}
                      className="font-semibold text-blue-600 transition hover:text-blue-700"
                    >
                      View details
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="text-xs font-semibold text-rose-400 transition hover:text-rose-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">New Project</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tell us about the initiative you’re planning.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Project Title</label>
                <input
                  name="title"
                  required
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g., Mobile App Redesign"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  required
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Summarize the initiative…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Goals</label>
                <textarea
                  name="goals"
                  rows={2}
                  required
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="What are you hoping to achieve?"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">North Star Metric (optional)</label>
                <input
                  name="north_star_metric"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g., Weekly Active Decision-Makers"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
