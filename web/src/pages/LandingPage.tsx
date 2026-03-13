import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const features = [
  "AI-powered PRD generation",
  "Smart roadmap planning",
  "Automated task management",
  "Collaborative workspace",
  "Multiple AI agents",
  "Template library",
];

const stats = [
  { value: "10x", label: "Faster Execution" },
  { value: "500+", label: "Product Teams" },
  { value: "50K+", label: "PRDs Generated" },
];

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 533.5 544.3" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M533.5 278.4a320 320 0 0 0-5-56.4H272v106.8h147.4a126 126 0 0 1-54.6 82.7v68.6h88.3c51.6-47.5 80.4-117.7 80.4-201.7"
      />
      <path
        fill="#34a853"
        d="M272 544.3c73.5 0 135.2-24.3 180.3-65.3l-88.3-68.6c-24.5 16.4-55.8 26-92 26-70.7 0-130.6-47.3-152-110.8H30.4v69.9A273.4 273.4 0 0 0 272 544.3"
      />
      <path fill="#fbbc04" d="M120 325.8a163.5 163.5 0 0 1 0-107.3v-69.9H30.4a273.4 273.4 0 0 0 0 247.1z" />
      <path
        fill="#ea4335"
        d="M272 107a148 148 0 0 1 104.7 41.1l78.1-78A262.7 262.7 0 0 0 272 0C169 0 78.8 58.7 30.4 148.6l89.6 69.9C141.2 154.3 201.3 107 272 107"
      />
    </svg>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  const handlePrimary = () => navigate("/onboarding");
  const handleGoogle = () => navigate("/signin");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d63f3] via-[#344ce1] to-[#5c30ed] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12 lg:flex-row lg:items-center lg:px-12 lg:py-20">
        <div className="flex-1">
          <div className="mb-8 flex items-center gap-3 text-white/90">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-2xl font-semibold">8</div>
            <span className="text-lg font-semibold tracking-tight">8product.ai</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              AI-Powered Product Management Platform
            </h1>
            <p className="max-w-2xl text-lg text-white/80">
              Leverage AI to 10x your productivity. Create PRDs, roadmaps, and manage your entire product workflow with intelligent
              assistance.
            </p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-base text-white/90">
                <span className="rounded-full bg-white/15 p-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-12 flex flex-wrap gap-8 text-white">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-semibold">{stat.value}</div>
                <p className="text-sm uppercase tracking-wide text-white/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="rounded-[32px] bg-white/90 p-8 text-slate-900 shadow-2xl backdrop-blur">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-wide text-indigo-500">Get Started</p>
              <h2 className="text-3xl font-semibold text-slate-900">Kick off your next project</h2>
              <p className="text-base text-slate-500">
                Start by creating your first project or sign up directly to access the entire suite.
              </p>
            </div>

            <div className="mt-8 space-y-6">
              <button
                type="button"
                onClick={handlePrimary}
                className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-[#6d4bff] to-[#b24ff9] px-6 py-4 text-lg font-semibold text-white shadow-lg transition-transform hover:translate-y-0.5"
              >
                <span>Create Your First Project</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 px-6 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </div>

            <p className="mt-8 text-center text-sm text-slate-400">
              By continuing, you agree to our{" "}
              <button type="button" onClick={handlePrimary} className="font-medium text-slate-600 underline-offset-2 hover:underline">
                Terms of Service
              </button>{" "}
              and{" "}
              <button type="button" onClick={handlePrimary} className="font-medium text-slate-600 underline-offset-2 hover:underline">
                Privacy Policy
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
