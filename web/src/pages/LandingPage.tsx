import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CheckSquare,
  FileText,
  Layers3,
  Map,
  Plug,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const features = [
  {
    title: "AI-Powered PRDs",
    description:
      "Write comprehensive Product Requirements Documents with AI assistance. Generate structured PRDs in minutes, not hours.",
    bg: "from-[#ad46ff] to-[#9810fa]",
    icon: FileText,
  },
  {
    title: "Smart Roadmaps",
    description:
      "Build and visualize product roadmaps effortlessly. Plan quarters, prioritize features, and communicate strategy effectively.",
    bg: "from-[#2b7fff] to-[#155dfc]",
    icon: Map,
  },
  {
    title: "Task Boards",
    description:
      "Manage tasks with Linear-style Kanban boards. Drag-and-drop workflow with real-time updates and team collaboration.",
    bg: "from-[#00c950] to-[#00a63e]",
    icon: CheckSquare,
  },
  {
    title: "Custom Agents",
    description:
      "Create specialized AI agents for any workflow. Build agents that understand your product context and automate repetitive tasks.",
    bg: "from-[#ff6900] to-[#f54900]",
    icon: Bot,
  },
  {
    title: "Project Hub",
    description:
      "Organize everything around projects. Keep all your PRDs, roadmaps, tasks, and knowledge in one central, accessible place.",
    bg: "from-[#f6339a] to-[#e60076]",
    icon: Layers3,
  },
  {
    title: "Tool Integrations",
    description:
      "Connect with your favorite tools. Seamless integration with Linear, Jira, Slack, Notion, and more to streamline your workflow.",
    bg: "from-[#615fff] to-[#4f39f6]",
    icon: Plug,
  },
];

const stats = [
  { value: "10x", label: "Faster PRD Writing" },
  { value: "5K+", label: "PRDs Created" },
  { value: "500+", label: "Product Managers" },
  { value: "50K+", label: "Tasks Managed" },
];

const testimonials = [
  {
    initials: "SC",
    name: "Sarah Chen",
    role: "Senior PM at TechCorp",
    quote:
      '"8product.com has transformed how I write PRDs. What used to take days now takes hours. The AI assistance is incredible."',
  },
  {
    initials: "MR",
    name: "Michael Rodriguez",
    role: "Product Lead at StartupXYZ",
    quote:
      '"The roadmap builder is exactly what we needed. Visual, collaborative, and integrated with our existing tools."',
  },
  {
    initials: "EW",
    name: "Emily Watson",
    role: "Principal PM at Enterprise Inc",
    quote:
      '"Custom agents are a game-changer. I\'ve created agents for user research, competitive analysis, and more."',
  },
];

function DemoCard({
  title,
  subtitle,
  color,
  Icon,
  children,
}: {
  title: string;
  subtitle: string;
  color: string;
  Icon: any;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-[14px] border-2 border-[#e5e7eb] bg-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
      <div className={`bg-gradient-to-r ${color} px-5 py-5 text-white`}>
        <Icon className="h-8 w-8" strokeWidth={2} />
        <h3 className="mt-2 text-[34px] font-bold leading-tight">{title}</h3>
        <p className="mt-1 text-sm text-white/90">{subtitle}</p>
      </div>
      <div className="bg-[#f9fafb] p-4">{children}</div>
    </article>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const handleGetStarted = () => navigate("/onboarding");

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif] text-[#101828]">
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white/80 px-5 py-4 backdrop-blur md:px-[86px]">
        <div className="mx-auto flex h-10 w-full max-w-[1232px] items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="8product logo" className="h-10 w-10" />
            <div className="text-2xl font-bold leading-8 tracking-[0.07px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] bg-clip-text text-transparent">
              8product.com
            </div>
          </div>
          <button
            type="button"
            onClick={handleGetStarted}
            className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 text-sm font-medium text-white"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-r from-[#f3efff] to-[#eaf2ff] px-5 pb-12 pt-12 md:px-[62px] md:pt-20">
        <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-gradient-to-br from-[#dab2ff]/30 to-[#8ec5ff]/30 blur-[64px]" />
        <div className="pointer-events-none absolute right-10 top-0 h-64 w-64 rounded-full bg-gradient-to-br from-[#8ec5ff]/20 to-[#dab2ff]/20 blur-[64px]" />
        <div className="pointer-events-none absolute left-[72%] top-[88px] h-4 w-4 rounded-full bg-[#c27aff]/40" />
        <div className="pointer-events-none absolute left-[28%] top-[170px] h-3 w-3 rounded-full bg-[#51a2ff]/40" />
        <div className="mx-auto max-w-[1280px]">
          <div className="mx-auto flex max-w-[1232px] flex-col items-center">
            <div className="mb-6 flex h-9 items-center gap-2 rounded-full bg-[#f3e8ff] px-4 text-sm font-medium text-[#8200db]">
              <Sparkles className="h-4 w-4" />
              Trusted by 500+ Product Managers
            </div>
            <h1 className="text-center text-5xl font-bold leading-[1.1] md:text-[60px] md:leading-[75px]">
              Build Better Products
              <span className="block bg-gradient-to-r from-[#9810fa] to-[#155dfc] bg-clip-text text-transparent">With AI Assistance</span>
            </h1>
            <p className="mt-6 max-w-[767px] text-center text-lg leading-8 text-[#4a5565] md:text-[20px]">
              The all-in-one platform for Product Managers. Write PRDs, build roadmaps, manage tasks, and create custom AI
              agents-all in one place. Supercharge your productivity with intelligent automation.
            </p>
            <button
              type="button"
              onClick={handleGetStarted}
              className="mt-8 flex h-[76px] items-center gap-3 rounded-lg bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-6 text-lg font-medium text-white"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="mt-12 grid w-full max-w-[896px] grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="bg-gradient-to-r from-[#9810fa] to-[#155dfc] bg-clip-text text-3xl font-bold text-transparent md:text-[40px]">
                    {stat.value}
                  </div>
                  <p className="mt-1 text-sm text-[#4a5565]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 rounded-[14px] border-2 border-[#e5e7eb] bg-white p-[2px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="overflow-hidden rounded-[12px]">
              <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-2">
                <div className="border-r border-[#e5e7eb] bg-white">
                  <div className="border-b border-[#e5e7eb] px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f3e8ff]">
                        <FileText className="h-5 w-5 text-[#9810fa]" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">PRD Assistant</div>
                        <div className="text-xs text-[#6a7282]">Online</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 px-4 py-4 text-sm">
                    <div className="max-w-[85%] rounded-[10px] bg-[#f3f4f6] px-3 py-2 text-[#1e2939]">
                      Hi! I&apos;ll help you create a comprehensive PRD. What product are you working on?
                    </div>
                    <div className="ml-auto max-w-[75%] rounded-[10px] bg-[#9810fa] px-3 py-2 text-white">
                      I&apos;m building a mobile app for expense tracking
                    </div>
                    <div className="max-w-[85%] rounded-[10px] bg-[#f3f4f6] px-3 py-2 text-[#1e2939]">
                      Great! Let me help you outline the key sections. Tell me about your target users.
                    </div>
                  </div>
                  <div className="border-t border-[#e5e7eb] p-4">
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm text-[#9ca3af]">Type your message...</div>
                      <div className="rounded-[10px] bg-[#9810fa] px-4 py-2 text-sm font-medium text-white">Send</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6">
                  <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
                    <FileText className="h-5 w-5 text-[#9810fa]" />
                    PRD Configuration
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-[10px] border border-[#e5e7eb] px-4 py-3">
                      <div className="mb-1 flex items-center justify-between text-sm font-medium">
                        Executive Summary
                        <CheckCircle2 className="h-4 w-4 text-[#00a63e]" />
                      </div>
                      <div className="text-xs text-[#4a5565]">A mobile expense tracking app that helps users manage their personal finances...</div>
                    </div>
                    <div className="rounded-[10px] border border-[#e5e7eb] px-4 py-3">
                      <div className="mb-1 flex items-center justify-between text-sm font-medium">
                        Target Users
                        <CheckCircle2 className="h-4 w-4 text-[#00a63e]" />
                      </div>
                      <div className="text-xs text-[#4a5565]">Young professionals aged 25-40 who want to track spending habits...</div>
                    </div>
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-[#faf5ff] px-4 py-3">
                      <div className="mb-1 flex items-center justify-between text-sm font-medium">
                        User Stories
                        <span className="text-xs text-[#9810fa]">In Progress</span>
                      </div>
                      <div className="text-xs text-[#4a5565]">As a user, I want to quickly capture expenses...</div>
                    </div>
                    <div className="rounded-[10px] border border-dashed border-[#d1d5dc] px-4 py-3">
                      <div className="mb-1 text-sm font-medium text-[#9ca3af]">Technical Requirements</div>
                      <div className="text-xs text-[#9ca3af]">Not started</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 md:px-[86px]">
        <div className="mx-auto max-w-[1232px]">
          <h2 className="text-center text-[36px] font-bold">Everything You Need in One Platform</h2>
          <p className="mt-4 text-center text-[20px] text-[#4a5565]">Powerful features designed specifically for modern Product Managers</p>
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-[14px] border border-[#e5e7eb] bg-white p-6">
                <div className={`mb-10 flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br ${feature.bg}`}>
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-[28px] font-bold leading-[1.15] md:text-[30px]">{feature.title}</h3>
                <p className="mt-4 text-[16px] leading-[1.6] text-[#4a5565]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-[#f9fafb] to-[#faf5ff] px-5 py-24 md:px-[62px]">
        <div className="mx-auto max-w-[1280px] px-6">
          <h2 className="text-center text-[36px] font-bold">See 8product.com in Action</h2>
          <p className="mt-4 text-center text-[20px] text-[#4a5565]">A glimpse of what you can build with our platform</p>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
            <DemoCard title="AI-Powered PRD Writer" subtitle="Chat interface that generates comprehensive PRDs" color="from-[#9810fa] to-[#8200db]" Icon={FileText}>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">PRD Assistant Chat</div>
                <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">Target Users auto-filled</div>
                <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">User stories drafts</div>
                <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">Structured sections</div>
              </div>
            </DemoCard>
            <DemoCard title="Visual Roadmap Planning" subtitle="Build and share beautiful product roadmaps" color="from-[#2b7fff] to-[#155dfc]" Icon={Map}>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between font-semibold text-[#111827]">
                  <span>Product Roadmap 2026</span>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-[#f3e8ff] px-2 py-1 text-[#9810fa]">Q1</span>
                    <span className="rounded-full bg-[#dbeafe] px-2 py-1 text-[#2563eb]">Q2</span>
                    <span className="rounded-full bg-[#dcfce7] px-2 py-1 text-[#16a34a]">Q3</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-[#d8b4fe] bg-[#faf5ff] p-2">Authentication</div>
                  <div className="rounded-lg border border-[#d8b4fe] bg-[#faf5ff] p-2">Expense Capture</div>
                  <div className="rounded-lg border border-[#d8b4fe] bg-[#faf5ff] p-2">Analytics</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-[#93c5fd] bg-[#eff6ff] p-2">Categories</div>
                  <div className="rounded-lg border border-[#93c5fd] bg-[#eff6ff] p-2">Budgets</div>
                  <div className="rounded-lg border border-[#93c5fd] bg-[#eff6ff] p-2">Alerts</div>
                </div>
              </div>
            </DemoCard>
            <DemoCard title="Kanban Task Boards" subtitle="Drag-and-drop task management for your team" color="from-[#00a63e] to-[#008a34]" Icon={CheckSquare}>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  ["Backlog", "Design notification", "API docs"],
                  ["In Progress", "Build form", "Setup schema"],
                  ["Review", "Auth flow", "UX copy"],
                  ["Done", "Project setup", "CI/CD"],
                ].map((col) => (
                  <div key={col[0]} className="rounded-lg border border-[#e5e7eb] bg-white p-2">
                    <div className="mb-2 text-[11px] font-semibold">{col[0]}</div>
                    <div className="space-y-2">
                      <div className="rounded-md border border-[#e5e7eb] bg-[#f8fafc] p-2">{col[1]}</div>
                      <div className="rounded-md border border-[#e5e7eb] bg-[#f8fafc] p-2">{col[2]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </DemoCard>
            <DemoCard title="Custom AI Agents" subtitle="Create specialized agents for any workflow" color="from-[#ff6900] to-[#e54500]" Icon={Bot}>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-2 rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                  <div className="font-semibold">Custom Agent</div>
                  <div className="rounded-md bg-[#f3f4f6] p-2">Hi! I&apos;ll help you build a custom agent.</div>
                  <div className="ml-auto w-fit rounded-md bg-[#f54900] p-2 text-white">I want an agent for feedback analysis</div>
                </div>
                <div className="space-y-2 rounded-[10px] border border-[#e5e7eb] bg-white p-3">
                  <div className="font-semibold">Agent Configuration</div>
                  <div className="rounded-md bg-[#f9fafb] p-2">Name: User Feedback Analyzer</div>
                  <div className="rounded-md bg-[#f9fafb] p-2">Purpose: sentiment + theme extraction</div>
                </div>
              </div>
            </DemoCard>
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 md:px-[86px]">
        <div className="mx-auto max-w-[1232px]">
          <h2 className="text-center text-[36px] font-bold">Loved by Product Managers</h2>
          <p className="mt-4 text-center text-[20px] text-[#4a5565]">Join hundreds of PMs building better products</p>
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {testimonials.map((t) => (
              <article key={t.name} className="rounded-[14px] border border-[#e5e7eb] bg-white px-6 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#ad46ff] to-[#2b7fff] text-base font-bold text-white">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-[28px] font-bold leading-tight">{t.name}</div>
                    <div className="text-sm text-[#4a5565]">{t.role}</div>
                  </div>
                </div>
                <p className="mt-10 text-[16px] leading-[1.6] text-[#364153]">{t.quote}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-[#9810fa] via-[#ad46ff] to-[#155dfc] px-5 py-24 md:px-0">
        <div className="pointer-events-none absolute left-8 top-8 h-64 w-64 rounded-full bg-white/10 blur-[64px]" />
        <div className="pointer-events-none absolute right-12 top-24 h-80 w-80 rounded-full bg-white/10 blur-[64px]" />
        <div className="mx-auto max-w-[896px] text-center">
          <h2 className="text-5xl font-bold leading-tight text-white">Ready to Build Better Products?</h2>
          <p className="mx-auto mt-6 max-w-[643px] text-[20px] leading-7 text-[#f3e8ff]">
            Join 500+ Product Managers who are already using 8product.com to ship faster and build products their customers love.
          </p>
          <button
            type="button"
            onClick={handleGetStarted}
            className="mx-auto mt-8 flex h-[76px] items-center gap-3 rounded-lg bg-white px-6 text-lg font-semibold text-[#9810fa]"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-[#f3e8ff]">
            {["No credit card required", "Cancel anytime", "1M tokens included"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#101828] px-5 py-6 md:px-[86px]">
        <div className="mx-auto flex max-w-[1232px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="8product logo" className="h-8 w-8" />
            <span className="text-[18px] font-bold text-white">8product.com</span>
          </div>
          <span className="text-sm text-[#99a1af]">© 2026 8product.com. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
