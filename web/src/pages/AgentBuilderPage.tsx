import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WORKSPACE_ID_KEY } from "../constants";

const figmaIcons = {
  back: "https://www.figma.com/api/mcp/asset/2c92d608-f4b1-4924-859d-20dbd6efecf8",
  save: "https://www.figma.com/api/mcp/asset/25cb6ab4-e603-480c-8857-d625bcd945e4",
  logo: "https://www.figma.com/api/mcp/asset/016994d1-fb19-4a9b-817d-c5a8410ce8c0",
  info: "https://www.figma.com/api/mcp/asset/4a0052a4-bee2-4ecc-a691-b577a13aa3b1",
  templateScratch: "https://www.figma.com/api/mcp/asset/ff5178be-1fee-42b6-84de-720dee5d870b",
  templatePrd: "https://www.figma.com/api/mcp/asset/5adf3b81-4471-4258-a0d8-8952e40c371e",
  templateSupport: "https://www.figma.com/api/mcp/asset/4294a9ae-d75a-459d-8623-3d823c430544",
  templateAnalytics: "https://www.figma.com/api/mcp/asset/48da096f-e463-4508-b9ed-54901812f675",
  templateCode: "https://www.figma.com/api/mcp/asset/c7d643bd-b098-417a-9e8a-4b61233b2d2c",
  templateContent: "https://www.figma.com/api/mcp/asset/e96854fc-ed3f-47aa-abcf-915c492ec925",
  configHeader: "https://www.figma.com/api/mcp/asset/fc12ac9e-2ef7-40b5-9fa8-43a552e72466",
  basics: "https://www.figma.com/api/mcp/asset/0efd9645-e05d-475b-bd23-8098196ed7c0",
  capabilities: "https://www.figma.com/api/mcp/asset/bf8a3fd2-03a7-4eb2-b282-dc18ac32d428",
  tools: "https://www.figma.com/api/mcp/asset/cfe68e7b-ed3f-4f59-9e9d-555001705f5a",
  context: "https://www.figma.com/api/mcp/asset/6d7a572f-cab9-4a64-af36-fd935b284cd7",
  behavior: "https://www.figma.com/api/mcp/asset/8c47612a-b9b5-435b-ac85-cddf3484395b",
  mcp: "https://www.figma.com/api/mcp/asset/d7e75719-dc45-43c2-b67f-52cd14a6a071",
  advanced: "https://www.figma.com/api/mcp/asset/5a593570-ab79-47a6-91b0-a76f7d7ea920",
  history: "https://www.figma.com/api/mcp/asset/9dee2ba8-ab03-4f93-9eca-9d94a40af7cf",
  proTip: "https://www.figma.com/api/mcp/asset/973490ee-98cc-48f8-be9f-40a0bf642e53",
  chevron: "https://www.figma.com/api/mcp/asset/e2021729-112f-402f-8ccb-7e1cb6b17bd4",
  inputVector1: "https://www.figma.com/api/mcp/asset/6576a346-3a67-43df-97c5-06c9f58c06ae",
  inputVector2: "https://www.figma.com/api/mcp/asset/3617e942-327b-4621-afbf-ac2083a46e52",
  inputVector3: "https://www.figma.com/api/mcp/asset/497d3458-6958-4397-bf06-b94eb2d51ee1",
  inputSend: "https://www.figma.com/api/mcp/asset/9f683be7-ce90-4807-bcb4-dfb0b524feaf",
  inputHelp: "https://www.figma.com/api/mcp/asset/f16c70f3-399a-43d3-bc82-3fbb3145c260",
};

const templates = [
  {
    title: "Start from Scratch",
    desc: "Build a completely custom agent for your specific needs",
    tag: "General",
    iconSrc: figmaIcons.templateScratch,
  },
  {
    title: "PRD Writer",
    desc: "Creates detailed Product Requirement Documents",
    tag: "Product",
    iconSrc: figmaIcons.templatePrd,
  },
  {
    title: "Customer Support Agent",
    desc: "Answers customer queries and provides support",
    tag: "Support",
    iconSrc: figmaIcons.templateSupport,
  },
  {
    title: "Data Analyst",
    desc: "Analyzes data and generates insights",
    tag: "Analytics",
    iconSrc: figmaIcons.templateAnalytics,
  },
  {
    title: "Code Reviewer",
    desc: "Reviews code and suggests improvements",
    tag: "Development",
    iconSrc: figmaIcons.templateCode,
  },
  {
    title: "Content Writer",
    desc: "Creates blog posts, articles, and marketing content",
    tag: "Content",
    iconSrc: figmaIcons.templateContent,
  },
];

const sidebarItems = [
  { title: "Basics", subtitle: "Core agent settings", tone: "bg-[#f3e8ff] text-[#7c3aed]", iconSrc: figmaIcons.basics },
  { title: "Capabilities", subtitle: "0 defined", tone: "bg-[#f3e8ff] text-[#7c3aed]", iconSrc: figmaIcons.capabilities },
  { title: "Tools", subtitle: "0 of 4 enabled", tone: "bg-[#dbeafe] text-[#2563eb]", iconSrc: figmaIcons.tools },
  { title: "Context", subtitle: "0 items linked", tone: "bg-[#dcfce7] text-[#16a34a]", iconSrc: figmaIcons.context },
  { title: "Behavior & Output", subtitle: "Configure agent responses", tone: "bg-[#e0e7ff] text-[#6366f1]", iconSrc: figmaIcons.behavior },
  { title: "MCP Connections", subtitle: "0 connected", tone: "bg-[#e0e7ff] text-[#6366f1]", iconSrc: figmaIcons.mcp },
  { title: "Advanced Settings", subtitle: "Model & parameters", tone: "bg-[#f1f5f9] text-[#475569]", iconSrc: figmaIcons.advanced },
];

const SidebarIcon = ({ color, iconSrc }: { color: string; iconSrc: string }) => (
  <div className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${color}`}>
    <img src={iconSrc} alt="" className="h-4 w-4" />
  </div>
);

const InputSparkIcon = () => (
  <div className="relative h-4 w-4">
    <div className="absolute bottom-[41.67%] left-1/4 right-1/4 top-[8.33%]">
      <img src={figmaIcons.inputVector1} alt="" className="h-full w-full" />
    </div>
    <div className="absolute bottom-1/4 left-[37.5%] right-[37.5%] top-3/4">
      <img src={figmaIcons.inputVector2} alt="" className="h-full w-full" />
    </div>
    <div className="absolute inset-[91.67%_41.67%_8.33%_41.67%]">
      <img src={figmaIcons.inputVector3} alt="" className="h-full w-full" />
    </div>
  </div>
);

const Chevron = () => <img src={figmaIcons.chevron} alt="" className="h-4 w-4" />;

export default function AgentBuilderPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const resolvedWorkspaceId =
    workspaceId ?? (typeof window !== "undefined" ? window.sessionStorage.getItem(WORKSPACE_ID_KEY) : null);
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [capabilities, setCapabilities] = useState([
    { id: 1, title: "New Capability", details: "", editing: false },
  ]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [behaviorOpen, setBehaviorOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [workspaceContextEnabled, setWorkspaceContextEnabled] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [advancedBehaviorOpen, setAdvancedBehaviorOpen] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string[]>([]);
  const [activeContextTab, setActiveContextTab] = useState<"all" | "projects" | "prds" | "roadmaps">("all");
  const [tools, setTools] = useState([
    { id: "web-search", name: "Web Search", desc: "Search the web for information", enabled: false },
    { id: "code-gen", name: "Code Generation", desc: "Generate and review code", enabled: false },
    { id: "data-analysis", name: "Data Analysis", desc: "Analyze data and create visualizations", enabled: false },
    { id: "doc-processing", name: "Document Processing", desc: "Read and process documents", enabled: false },
  ]);
  const [behaviorToggles, setBehaviorToggles] = useState({
    greeting: true,
    followUp: true,
    markdown: false,
    structured: true,
    citations: false,
    partial: true,
    streaming: false,
    workspaceKnowledge: true,
    conversationHistory: true,
    linkedItems: true,
  });
  const [outputFormat, setOutputFormat] = useState("");
  const [tone, setTone] = useState("");
  const [responseLength, setResponseLength] = useState("");
  const [verbosity, setVerbosity] = useState(3);
  const [selectedModel, setSelectedModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState("2000");

  const updateCapability = (id: number, patch: Partial<(typeof capabilities)[number]>) => {
    setCapabilities((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeCapability = (id: number) => {
    setCapabilities((prev) => prev.filter((item) => item.id !== id));
  };

  const addCapability = () => {
    setCapabilities((prev) => [
      ...prev,
      { id: Date.now(), title: "New Capability", details: "", editing: true },
    ]);
  };

  const toggleTool = (id: string) => {
    setTools((prev) => prev.map((tool) => (tool.id === id ? { ...tool, enabled: !tool.enabled } : tool)));
  };
  const toggleBehavior = (key: keyof typeof behaviorToggles) => {
    setBehaviorToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const contextProjects = [
    "Mobile App Redesign",
    "API Platform v2",
    "Analytics Dashboard",
    "E-commerce Platform",
    "Internationalization Initiative",
  ];
  const contextPrds = [
    "Mobile App Redesign - User Authentication Flow",
  ];
  const contextRoadmaps = [
    "Q1 2026 Product Roadmap",
    "API Platform v2.0 Roadmap",
  ];
  const contextItems = [
    ...contextProjects.map((label) => ({ id: `project:${label}`, label, type: "projects" as const })),
    ...contextPrds.map((label) => ({ id: `prd:${label}`, label, type: "prds" as const })),
    ...contextRoadmaps.map((label) => ({ id: `roadmap:${label}`, label, type: "roadmaps" as const })),
  ];
  const toggleContextItem = (id: string) => {
    setSelectedContext((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="min-h-screen bg-white text-[#101828]">
      <div className="flex min-h-screen w-full bg-white">
        <div className="flex min-h-screen flex-1 flex-col border-r border-[#e5e7eb]">
          <div className="border-b border-[#e5e7eb] px-6 pb-4 pt-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-medium text-[#0a0a0a]"
                onClick={() => {
                  if (resolvedWorkspaceId) {
                    navigate(`/workspaces/${resolvedWorkspaceId}/agents`);
                    return;
                  }
                  navigate(-1);
                }}
              >
                <img src={figmaIcons.back} alt="" className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-sm font-semibold text-white"
              >
                <img src={figmaIcons.save} alt="" className="h-4 w-4" />
                Save Agent
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <img src={figmaIcons.logo} alt="" className="h-8 w-8" />
              <p className="bg-gradient-to-r from-[#9810fa] to-[#155dfc] bg-clip-text text-[20px] font-bold text-transparent">
                8product.ai
              </p>
            </div>
            <h1 className="mt-4 text-[24px] font-bold">Create Your AI Agent</h1>
            <div className="mt-1 flex items-center gap-2 text-[16px] text-[#4a5565]">
              <img src={figmaIcons.info} alt="" className="h-4 w-4" />
              Chat to define what your agent should do, configure it on the right
            </div>
          </div>

          <div className={`flex-1 overflow-auto ${chatMode ? "px-6" : "px-[69px]"} pt-6 pb-24`}>
            {!chatMode ? (
              <>
                <div className="text-center">
                  <h2 className="text-[24px] font-bold">Choose an Agent Template</h2>
                  <p className="mt-2 text-sm text-[#4a5565]">Start with a template or build from scratch</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  {templates.map((template) => {
                    const isScratch = template.title === "Start from Scratch";
                    return (
                      <button
                        key={template.title}
                        type="button"
                        className="rounded-[14px] border-2 border-[#e5e7eb] bg-white p-6 text-left transition hover:border-[#c084fc]"
                        onClick={() => {
                          if (isScratch) {
                            setChatMode(true);
                          }
                        }}
                      >
                        <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#f3e8ff] to-[#dbeafe] text-[#7c3aed]">
                            <img src={template.iconSrc} alt="" className="h-5 w-5" />
                        </div>
                          <div>
                            <p className="text-sm font-semibold text-[#101828]">{template.title}</p>
                            <p className="mt-1 text-xs font-medium text-[#4a5565]">{template.desc}</p>
                            <span className="mt-3 inline-flex rounded-[4px] bg-[#f3e8ff] px-2 py-0.5 text-xs font-medium text-[#8200db]">
                              {template.tag}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mt-6 w-full text-center text-xs font-medium text-[#6a7282]"
                  onClick={() => setChatMode(true)}
                >
                  Skip and start chatting
                </button>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                  <img
                    src="https://www.figma.com/api/mcp/asset/1a4141e1-07ab-4a94-b03c-8b449083e370"
                    alt=""
                    className="h-4 w-4"
                  />
                </div>
                <div className="w-[576px] rounded-[14px] bg-[#f3f4f6] px-4 py-3 text-[14px] text-[#101828]">
                  <p>I'll help you build a custom agent. What would you like your agent to do?</p>
                  <div className="mt-3 border-t border-[#e5e7eb] pt-3">
                    <p className="text-[12px] font-medium text-[#4a5565]">Quick actions:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "What specific capabilities do you need?",
                        "How should the agent behave?",
                        "What output format do you prefer?",
                      ].map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-[#d1d5dc] bg-white px-3 py-1 text-[12px] font-medium text-[#101828]"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-[#e5e7eb] bg-white px-6 py-4">
            {chatMode ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#6a7282]">
                  <span>Try:</span>
                  {["Make it professional", "Enable web search", "Add structured output", "Be more concise"].map(
                    (chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-[#e9d4ff] bg-[#faf5ff] px-3 py-1 text-[12px] font-medium text-[#8200db]"
                      >
                        {chip}
                      </span>
                    ),
                  )}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    className="flex h-9 w-[42px] items-center justify-center rounded-[10px] border border-[#d1d5dc] bg-white"
                  >
                    <InputSparkIcon />
                  </button>
                  <div className="flex h-9 flex-1 items-center rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#717182]">
                    Describe what your agent should do...
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-10 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] opacity-50"
                  >
                    <img src={figmaIcons.inputSend} alt="" className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-[12px] text-[#6a7282]">
                  💡 Try: "Make it professional", "Add structured output", or click
                  <img src={figmaIcons.inputHelp} alt="" className="ml-1 inline-block h-3 w-3 align-middle" />{" "}
                  for templates
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="flex h-9 w-[42px] items-center justify-center rounded-[10px] border border-[#d1d5dc] bg-white"
                  >
                    <InputSparkIcon />
                  </button>
                  <div className="flex h-9 flex-1 items-center rounded-[8px] bg-[#f3f3f5] px-3 text-[14px] text-[#717182]">
                    Describe what your agent should do...
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-10 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] opacity-50"
                  >
                    <img src={figmaIcons.inputSend} alt="" className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-[#6a7282]">
                  💡 Try: "Make it professional", "Add structured output", or click
                  <img src={figmaIcons.inputHelp} alt="" className="ml-1 inline-block h-3 w-3 align-middle" />{" "}
                  for templates
                </p>
              </>
            )}
          </div>
        </div>

        <aside className="w-[384px] border-l border-[#e5e7eb]">
          <div className="border-b border-[#e5e7eb] px-6 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ad46ff] to-[#2b7fff]">
                <img src={figmaIcons.configHeader} alt="" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[20px] font-semibold">Agent Configuration</p>
                <p className="text-xs text-[#6a7282]">Updates live as you chat</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[12px] font-semibold uppercase text-[#6a7282]">Configuration Progress</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-[#eef2ff]">
                  <div className="h-2 w-[20%] rounded-full bg-gradient-to-r from-[#ad46ff] to-[#2b7fff]" />
                </div>
                <span className="text-xs text-[#6a7282]">1/5</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            {sidebarItems.map((item, index) => {
              const isBasics = item.title === "Basics";
              const isCapabilities = item.title === "Capabilities";
              const isTools = item.title === "Tools";
              const isContext = item.title === "Context";
              const isBehavior = item.title === "Behavior & Output";
              const isAdvanced = item.title === "Advanced Settings" && item.subtitle === "Model & parameters";
              const isOpen = isBasics
                ? basicsOpen
                : isCapabilities
                  ? capabilitiesOpen
                  : isTools
                    ? toolsOpen
                    : isContext
                      ? contextOpen
                      : isBehavior
                        ? behaviorOpen
                        : isAdvanced
                          ? advancedOpen
                          : false;
              const subtitle =
                item.title === "Capabilities"
                  ? `${capabilities.length} defined`
                  : item.title === "Tools"
                    ? `${tools.filter((tool) => tool.enabled).length} of ${tools.length} enabled`
                    : item.subtitle;
              return (
                <div key={item.title + index} className="border-b border-[#e5e7eb]">
                  <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                      <SidebarIcon color={item.tone} iconSrc={item.iconSrc} />
                      <div>
                        <p className="text-sm font-semibold text-[#101828]">{item.title}</p>
                        <p className="text-xs text-[#6a7282]">{subtitle}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                      onClick={() => {
                        if (isBasics) setBasicsOpen((prev) => !prev);
                        if (isCapabilities) setCapabilitiesOpen((prev) => !prev);
                        if (isTools) setToolsOpen((prev) => !prev);
                        if (isContext) setContextOpen((prev) => !prev);
                        if (isBehavior) setBehaviorOpen((prev) => !prev);
                        if (isAdvanced) setAdvancedOpen((prev) => !prev);
                      }}
                    >
                      <Chevron />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-6 pb-4">
                      {isBasics && (
                        <div className="grid gap-3 text-[12px] text-[#4a5565]">
                          <label className="grid gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                              Agent Name
                            </span>
                            <input
                              className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                              defaultValue="My AI Agent"
                              placeholder="My AI Agent"
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                              Description
                            </span>
                            <input
                              className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                              placeholder="What does this agent do?"
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                              Purpose
                            </span>
                            <input
                              className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                              placeholder="What is the main purpose of this agent?"
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
                              Instructions
                            </span>
                            <textarea
                              className="h-[72px] resize-none rounded-[10px] border border-[#e5e7eb] px-3 py-2 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                              placeholder="Provide detailed instructions for the agent..."
                            />
                          </label>
                        </div>
                      )}
                      {isCapabilities && (
                        <div className="pb-4">
                          <div className="flex flex-col gap-3">
                            {capabilities.map((capability) =>
                              capability.editing ? (
                                <div
                                  key={capability.id}
                                  className="rounded-[12px] border border-[#e5e7eb] bg-[#f8fafc] p-3"
                                >
                                  <input
                                    className="h-8 w-full rounded-[8px] border border-[#e5e7eb] bg-white px-3 text-[12px] font-semibold text-[#101828] placeholder:text-[#98a2b3]"
                                    placeholder="Capability name"
                                    value={capability.title}
                                    onChange={(event) =>
                                      updateCapability(capability.id, { title: event.target.value })
                                    }
                                  />
                                  <input
                                    className="mt-2 h-8 w-full rounded-[8px] border border-[#e5e7eb] bg-white px-3 text-[12px] text-[#101828] placeholder:text-[#98a2af]"
                                    placeholder="Describe what this capability does..."
                                    value={capability.details}
                                    onChange={(event) =>
                                      updateCapability(capability.id, { details: event.target.value })
                                    }
                                  />
                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="flex-1 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-3 py-2 text-[12px] font-semibold text-white"
                                      onClick={() => updateCapability(capability.id, { editing: false })}
                                    >
                                      ✓ Done
                                    </button>
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#e5e7eb] bg-white text-[#ef4444]"
                                      aria-label="Delete capability"
                                      onClick={() => removeCapability(capability.id)}
                                    >
                                      <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                        <path
                                          d="M6 3.5h4M3.5 4.5h9M5.5 4.5v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-7M7 6.5v4M9 6.5v4"
                                          stroke="currentColor"
                                          strokeWidth="1.2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={capability.id}
                                  className="rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-3"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-[#101828]">{capability.title}</p>
                                    <div className="flex items-center gap-2 text-[#98a2b3]">
                                      <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded-[6px] hover:bg-[#f3f4f6]"
                                        aria-label="Edit capability"
                                        onClick={() => updateCapability(capability.id, { editing: true })}
                                      >
                                        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                          <path
                                            d="M3 11.5l1.2-.2 6.6-6.6-1-1L3.2 10.3 3 11.5z"
                                            stroke="currentColor"
                                            strokeWidth="1.2"
                                            strokeLinejoin="round"
                                          />
                                          <path
                                            d="M9.8 3.7l1 1"
                                            stroke="currentColor"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[#ef4444] hover:bg-[#fee2e2]"
                                        aria-label="Delete capability"
                                        onClick={() => removeCapability(capability.id)}
                                      >
                                        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                          <path
                                            d="M6 3.5h4M3.5 4.5h9M5.5 4.5v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-7M7 6.5v4M9 6.5v4"
                                            stroke="currentColor"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                  <p className="mt-2 text-[12px] text-[#6a7282]">
                                    {capability.details || "Click to edit and describe what this capability does"}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                          <button
                            type="button"
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-semibold text-[#101828]"
                            onClick={addCapability}
                          >
                            <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Add More
                          </button>
                        </div>
                      )}
                      {isTools && (
                        <div className="flex flex-col gap-2">
                          {tools.map((tool) => (
                            <div
                              key={tool.id}
                              className="flex items-center justify-between rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2"
                            >
                              <div>
                                <p className="text-[12px] font-semibold text-[#101828]">{tool.name}</p>
                                <p className="text-[11px] text-[#6a7282]">{tool.desc}</p>
                              </div>
                              <button
                                type="button"
                                aria-pressed={tool.enabled}
                                className={`flex h-5 w-9 items-center rounded-full px-[2px] transition ${
                                  tool.enabled ? "bg-[#7c3aed]" : "bg-[#e5e7eb]"
                                }`}
                                onClick={() => toggleTool(tool.id)}
                              >
                                <span
                                  className={`h-4 w-4 rounded-full bg-white transition ${
                                    tool.enabled ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {isContext && (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2">
                            <div>
                              <p className="text-[12px] font-semibold text-[#101828]">Workspace Context</p>
                              <p className="text-[11px] text-[#6a7282]">Include all workspace knowledge</p>
                            </div>
                            <button
                              type="button"
                              aria-pressed={workspaceContextEnabled}
                              className={`flex h-5 w-9 items-center rounded-full px-[2px] transition ${
                                workspaceContextEnabled ? "bg-[#7c3aed]" : "bg-[#e5e7eb]"
                              }`}
                              onClick={() => setWorkspaceContextEnabled((prev) => !prev)}
                            >
                              <span
                                className={`h-4 w-4 rounded-full bg-white transition ${
                                  workspaceContextEnabled ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>
                          <div className="flex flex-col items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-4 text-center">
                            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f3f4f6] text-[#7c3aed]">
                              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                <path
                                  d="M3 4.5h5l1 1h4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                            <p className="text-[12px] font-semibold text-[#101828]">No context linked yet</p>
                            <p className="text-[11px] text-[#6a7282]">
                              Link PRDs, Projects, and Roadmaps to give your agent relevant context
                            </p>
                            <button
                              type="button"
                              className="mt-1 flex items-center gap-2 rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-1 text-[12px] font-semibold text-[#101828]"
                              onClick={() => setContextModalOpen(true)}
                            >
                              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              Add Context
                            </button>
                          </div>
                        </div>
                      )}
                      {isBehavior && (
                        <div className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[#101828]">Behavior Settings</p>
                            <div className="mt-3 space-y-3">
                              {[
                                { key: "greeting", label: "Show greeting message" },
                                { key: "followUp", label: "Ask follow-up questions" },
                                { key: "markdown", label: "Format output in Markdown" },
                                { key: "structured", label: "Use structured output" },
                                { key: "citations", label: "Include citations & sources" },
                                { key: "partial", label: "Allow partial responses" },
                                { key: "streaming", label: "Stream responses (real-time)" },
                              ].map((item) => {
                                const enabled = behaviorToggles[item.key as keyof typeof behaviorToggles];
                                return (
                                  <div key={item.key} className="flex items-center justify-between text-[12px] text-[#4a5565]">
                                    <span className="text-[12px] font-medium text-[#4a5565]">{item.label}</span>
                                    <button
                                      type="button"
                                      className={`relative h-5 w-9 rounded-full transition ${
                                        enabled ? "bg-[#7c3aed]" : "bg-[#e5e7eb]"
                                      }`}
                                      onClick={() => toggleBehavior(item.key as keyof typeof behaviorToggles)}
                                      aria-pressed={enabled}
                                    >
                                      <span
                                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                          enabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="border-t border-[#e5e7eb] pt-3">
                            <p className="text-[12px] font-semibold text-[#101828]">Context Inclusion</p>
                            <div className="mt-3 space-y-3">
                              {[
                                { key: "workspaceKnowledge", label: "Include workspace knowledge" },
                                { key: "conversationHistory", label: "Include conversation history" },
                                { key: "linkedItems", label: "Include linked items & context" },
                              ].map((item) => {
                                const enabled = behaviorToggles[item.key as keyof typeof behaviorToggles];
                                return (
                                  <div key={item.key} className="flex items-center justify-between text-[12px] text-[#4a5565]">
                                    <span className="text-[12px] font-medium text-[#4a5565]">{item.label}</span>
                                    <button
                                      type="button"
                                      className={`relative h-5 w-9 rounded-full transition ${
                                        enabled ? "bg-[#7c3aed]" : "bg-[#e5e7eb]"
                                      }`}
                                      onClick={() => toggleBehavior(item.key as keyof typeof behaviorToggles)}
                                      aria-pressed={enabled}
                                    >
                                      <span
                                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                          enabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="border-t border-[#e5e7eb] pt-3">
                            <p className="text-[12px] font-semibold text-[#101828]">Output Controls</p>
                            <label className="mt-3 grid gap-2 text-[12px] text-[#6a7282]">
                              <span className="font-medium text-[#6a7282]">Output Format</span>
                              <input
                                className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                                placeholder=""
                                value={outputFormat}
                                onChange={(event) => setOutputFormat(event.target.value)}
                              />
                            </label>
                            <label className="mt-3 grid gap-2 text-[12px] text-[#6a7282]">
                              <span className="font-medium text-[#6a7282]">Tone</span>
                              <input
                                className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                                placeholder=""
                                value={tone}
                                onChange={(event) => setTone(event.target.value)}
                              />
                            </label>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[12px] text-[#6a7282]">
                                <span className="font-medium text-[#6a7282]">Verbosity (1-5): {verbosity}</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                value={verbosity}
                                onChange={(event) => setVerbosity(Number(event.target.value))}
                                className="mt-2 w-full accent-[#7c3aed]"
                              />
                              <div className="mt-2 flex justify-between text-[10px] text-[#6a7282]">
                                <span>Concise</span>
                                <span>Balanced</span>
                                <span>Detailed</span>
                              </div>
                            </div>
                            <label className="mt-3 grid gap-2 text-[12px] text-[#6a7282]">
                              <span className="font-medium text-[#6a7282]">Response Length</span>
                              <input
                                className="h-9 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] text-[#101828] placeholder:text-[#9aa2af]"
                                placeholder=""
                                value={responseLength}
                                onChange={(event) => setResponseLength(event.target.value)}
                              />
                            </label>
                            <div className="mt-3 border-t border-[#e5e7eb] pt-3">
                              <button
                                type="button"
                                className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-3 py-2 text-[14px] font-medium text-[#0a0a0a]"
                                onClick={() => setAdvancedBehaviorOpen(true)}
                              >
                                <img
                                  src="https://www.figma.com/api/mcp/asset/e3e0249e-5599-47ca-91c4-94c7333c594c"
                                  alt=""
                                  className="h-4 w-4"
                                />
                                Advanced Configuration
                              </button>
                              <p className="mt-2 text-center text-[12px] text-[#6a7282]">
                                Configure detailed instructions, output structure, and custom fields
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {isAdvanced && (
                        <div className="space-y-4">
                          <div className="grid gap-2">
                            <p className="text-[12px] font-medium text-[#364153]">Model</p>
                            <div className="relative">
                              <select
                                className="h-[37px] w-full appearance-none rounded-[10px] border border-[#d1d5dc] bg-white px-3 text-[14px] text-[#101828]"
                                value={selectedModel}
                                onChange={(event) => setSelectedModel(event.target.value)}
                              >
                                <option value="" disabled>
                                  Select model
                                </option>
                                <option value="gpt-4">gpt-4</option>
                                <option value="gpt-4-turbo">gpt-4-turbo</option>
                                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                                <option value="claude-3-opus">claude-3-opus</option>
                                <option value="claude-3-sonnet">claude-3-sonnet</option>
                              </select>
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#98a2b3]">
                                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              </span>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between text-[12px] text-[#364153]">
                              <span className="font-medium">Temperature</span>
                              <span className="text-[#7c3aed]">{temperature.toFixed(1)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.1}
                              value={temperature}
                              onChange={(event) => setTemperature(Number(event.target.value))}
                              className="w-full accent-[#7c3aed]"
                            />
                            <div className="flex items-center justify-between text-[12px] text-[#6a7282]">
                              <span>Precise</span>
                              <span>Balanced</span>
                              <span>Creative</span>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <p className="text-[12px] font-medium text-[#364153]">Max Tokens</p>
                            <input
                              className="h-9 rounded-[8px] border border-transparent bg-[#f3f3f5] px-3 text-[14px] text-[#0a0a0a]"
                              value={maxTokens}
                              onChange={(event) => setMaxTokens(event.target.value)}
                            />
                            <p className="text-[12px] text-[#6a7282]">Maximum response length (100-8000)</p>
                          </div>
                          <div className="rounded-[14px] border border-[#e2e8f0] bg-[#f8fafc] p-3 text-[12px] text-[#314158]">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-[#6b7280]">
                                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                                  <path d="M8 5.5v3.5M8 11.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                              </span>
                              Higher temperature = more creative but less predictable responses
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-center gap-2 bg-[#f9fafb] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#6a7282]">
              <span className="h-px flex-1 bg-[#d1d5dc]" />
              Monitoring
              <span className="h-px flex-1 bg-[#d1d5dc]" />
            </div>
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SidebarIcon color="bg-[#fef3c6] text-[#f59e0b]" iconSrc={figmaIcons.history} />
                  <div>
                    <p className="text-sm font-semibold">Run History</p>
                    <p className="text-xs text-[#6a7282]">0 executions</p>
                  </div>
                </div>
                <Chevron />
              </div>
            </div>
            <div className="mx-6 my-4 rounded-[14px] border border-[#f3e8ff] bg-gradient-to-br from-[#faf5ff] to-[#eff6ff] p-4">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#9810fa]">
                  <img src={figmaIcons.proTip} alt="" className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Pro Tip</p>
                  <p className="mt-1 text-xs text-[#4a5565]">
                    The more specific you are about capabilities and context, the better your agent will perform!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#e5e7eb] px-4 py-4">
            <button className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-sm font-semibold text-white opacity-60">
              <img src={figmaIcons.save} alt="" className="h-4 w-4" />
              Save Agent
            </button>
          </div>
        </aside>
      </div>

      {contextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[766px] overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between border-b border-[#e5e7eb] px-6 pb-4 pt-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#dcfce7] text-[#16a34a]">
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M3 4.5h5l1 1h4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-[#101828]">Add Context to Agent</p>
                  <p className="text-[12px] text-[#6a7282]">Select items to give your agent relevant context</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#98a2b3] hover:bg-[#f3f4f6]"
                aria-label="Close"
                onClick={() => setContextModalOpen(false)}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: `All (${contextItems.length})`, icon: "all" },
                  { id: "projects", label: `Projects (${contextProjects.length})`, icon: "projects" },
                  { id: "prds", label: `PRDs (${contextPrds.length})`, icon: "prds" },
                  { id: "roadmaps", label: `Roadmaps (${contextRoadmaps.length})`, icon: "roadmaps" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`flex items-center gap-2 rounded-[8px] border px-3 py-1 text-[12px] font-semibold ${
                      activeContextTab === tab.id
                        ? "border-transparent bg-[#7c3aed] text-white shadow-sm"
                        : "border-[#e5e7eb] bg-white text-[#4a5565]"
                    }`}
                    onClick={() =>
                      setActiveContextTab(tab.id as "all" | "projects" | "prds" | "roadmaps")
                    }
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-current">
                      {tab.icon === "all" && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      )}
                      {tab.icon === "projects" && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                          <path
                            d="M3 4.5h5l1 1h4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {tab.icon === "prds" && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                          <path
                            d="M4 3.5h6l2 2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                      )}
                      {tab.icon === "roadmaps" && (
                        <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M3 4.5h10M5 7.5h8M3 10.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      )}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 pb-4 pt-3">
              <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                {activeContextTab === "all" || activeContextTab === "projects" ? (
                  <div>
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f3e8ff] text-[#7c3aed]">
                        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                          <path
                            d="M3 4.5h5l1 1h4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      Projects
                    </div>
                    <div className="mt-3 space-y-2">
                      {contextProjects.map((label) => {
                        const id = `project:${label}`;
                        const checked = selectedContext.includes(id);
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-[17px] py-[11px] text-[14px] text-[#101828]"
                          >
                            <input
                              type="checkbox"
                              className="h-[20px] w-[20px] rounded-[4px] border-2 border-[#d1d5dc]"
                              checked={checked}
                              onChange={() => toggleContextItem(id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center text-[#98a2b3]">
                              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                <path
                                  d="M3 4.5h5l1 1h4v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {activeContextTab === "all" || activeContextTab === "prds" ? (
                  <div>
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f3e8ff] text-[#7c3aed]">
                        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                          <path
                            d="M4 3.5h6l2 2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                          />
                        </svg>
                      </span>
                      PRDs
                    </div>
                    <div className="mt-3 space-y-2">
                      {contextPrds.map((label) => {
                        const id = `prd:${label}`;
                        const checked = selectedContext.includes(id);
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-[17px] py-[11px] text-[14px] text-[#101828]"
                          >
                            <input
                              type="checkbox"
                              className="h-[20px] w-[20px] rounded-[4px] border-2 border-[#d1d5dc]"
                              checked={checked}
                              onChange={() => toggleContextItem(id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center text-[#98a2b3]">
                              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                <path
                                  d="M4 3.5h6l2 2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"
                                  stroke="currentColor"
                                  strokeWidth="1.2"
                                />
                              </svg>
                            </span>
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {activeContextTab === "all" || activeContextTab === "roadmaps" ? (
                  <div>
                    <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#dcfce7] text-[#16a34a]">
                        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                          <path d="M3 4.5h10M5 7.5h8M3 10.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </span>
                      Roadmaps
                    </div>
                    <div className="mt-3 space-y-2">
                      {contextRoadmaps.map((label) => {
                        const id = `roadmap:${label}`;
                        const checked = selectedContext.includes(id);
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-[17px] py-[11px] text-[14px] text-[#101828]"
                          >
                            <input
                              type="checkbox"
                              className="h-[20px] w-[20px] rounded-[4px] border-2 border-[#d1d5dc]"
                              checked={checked}
                              onChange={() => toggleContextItem(id)}
                            />
                            <span className="flex h-4 w-4 items-center justify-center text-[#98a2b3]">
                              <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                                <path d="M3 4.5h10M5 7.5h8M3 10.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                              </svg>
                            </span>
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-4">
              <div className="flex items-center gap-2 text-[14px] text-[#4a5565]">
                <span className="flex h-4 w-4 items-center justify-center text-[#98a2b3]">
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="M8 3a5 5 0 1 1-3.6 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M3 2.5v3.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </span>
                {selectedContext.length} linked
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-[14px] font-medium text-[#0a0a0a]"
                  onClick={() => setContextModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-[14px] font-semibold text-white ${
                    selectedContext.length === 0 ? "opacity-50" : ""
                  }`}
                  onClick={() => setContextModalOpen(false)}
                  disabled={selectedContext.length === 0}
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {advancedBehaviorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-[768px] overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between border-b border-[#e5e7eb] px-6 pb-4 pt-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#ede9fe] text-[#7c3aed]">
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M8 2.2l1.1 2.7 2.7 1.1-2.7 1.1L8 9.8 6.9 7.1 4.2 6 6.9 4.9 8 2.2z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-[#101828]">Advanced Behavior Configuration</p>
                  <p className="text-[12px] text-[#6a7282]">Fine-tune how your agent processes and responds</p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#98a2b3] hover:bg-[#f3f4f6]"
                aria-label="Close"
                onClick={() => setAdvancedBehaviorOpen(false)}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="max-h-[560px] overflow-y-auto px-6 py-5">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#f3e8ff] text-[#7c3aed]">
                  <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                    <path
                      d="M8 2.2l1.1 2.7 2.7 1.1-2.7 1.1L8 9.8 6.9 7.1 4.2 6 6.9 4.9 8 2.2z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                </span>
                Agent Instructions
              </div>

              <div className="mt-4 grid gap-4">
                {[
                  {
                    label: "Initial Questions",
                    placeholder: "Questions the agent should ask users initially (one per line)...",
                    helper: "Questions to collect information from users",
                  },
                  {
                    label: "Output Structure Template",
                    placeholder: "Define the structure for agent outputs (e.g., sections, fields, format)...",
                    helper: "Template for how the agent should structure its outputs",
                  },
                  {
                    label: "Required Fields/Sections",
                    placeholder: "List required fields or sections (one per line)...",
                    helper: "Fields or sections that must be included in outputs",
                  },
                  {
                    label: "Field/Section Guidelines",
                    placeholder: "Provide guidance for each field/section (Field: guidance format)...",
                    helper: "Specific guidelines for how to handle each field/section",
                  },
                  {
                    label: "Behavioral Instructions",
                    placeholder: "How should the agent behave? (e.g., be proactive, ask clarifying questions, etc.)...",
                    helper: "Define how the agent should interact and behave",
                  },
                  {
                    label: "System Instructions",
                    placeholder: "Detailed system-level instructions for the agent's processing logic...",
                    helper: "Low-level instructions for how the agent processes information",
                  },
                ].map((field) => (
                  <div key={field.label} className="grid gap-2">
                    <p className="text-[12px] font-medium text-[#364153]">{field.label}</p>
                    <textarea
                      className="min-h-[60px] resize-none rounded-[10px] border border-[#d1d5dc] px-[12px] py-[8px] text-[14px] text-[#101828] placeholder:text-[#9aa2af]"
                      placeholder={field.placeholder}
                    />
                    <p className="text-[12px] text-[#6a7282]">{field.helper}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-[#e5e7eb] pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-[#101828]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#ede9fe] text-[#7c3aed]">
                      <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                        <path d="M4 3h8v10H4z" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M6 5h4M6 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </span>
                    Custom Input Fields
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-3 py-1.5 text-[14px] font-medium text-[#0a0a0a]"
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    Add Field
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-[#6a7282]">Add custom fields for user inputs specific to your agent</p>

                <div className="mt-4 rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-[8px] bg-[#f3f3f5] px-[12px] py-[8px] text-[14px] text-[#717182]">
                      New Field
                    </div>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-[8px]">
                      <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 text-[#6a7282]" aria-hidden="true">
                        <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-[12px] text-[#4a5565]">
                      <span className="font-medium">Field Key</span>
                      <input
                        className="h-9 rounded-[8px] border border-transparent bg-[#f3f3f5] px-[12px] text-[14px] text-[#717182]"
                        placeholder="new_field"
                      />
                    </label>
                    <label className="grid gap-1 text-[12px] text-[#4a5565]">
                      <span className="font-medium">Field Type</span>
                      <div className="h-9 rounded-[10px] border border-[#d1d5dc] bg-white px-[12px] text-[14px] text-[#101828]" />
                    </label>
                  </div>

                  <label className="mt-3 grid gap-1 text-[12px] text-[#4a5565]">
                    <span className="font-medium">Default Value</span>
                    <input
                      className="h-9 rounded-[8px] border border-transparent bg-[#f3f3f5] px-[12px] text-[14px] text-[#717182]"
                      placeholder="Default value (optional)"
                    />
                  </label>

                  <label className="mt-3 flex items-center gap-2 text-[14px] font-medium text-[#364153]">
                    <input type="checkbox" className="h-4 w-4 rounded border-[#d1d5dc]" />
                    Required field
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#e5e7eb] bg-[#f9fafb] px-6 py-4">
              <button
                type="button"
                className="rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-white px-4 py-2 text-[14px] font-medium text-[#0a0a0a]"
                onClick={() => setAdvancedBehaviorOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-[8px] bg-gradient-to-r from-[#9810fa] to-[#155dfc] px-4 py-2 text-[14px] font-medium text-white"
                onClick={() => setAdvancedBehaviorOpen(false)}
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
