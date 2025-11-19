function asString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => Boolean(item));
  }
  const single = asString(value);
  return single ? [single] : [];
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function endpointToString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const method = asString(value["method"]) ?? asString(value["http_method"]) ?? asString(value["verb"]);
    const path =
      asString(value["path"]) ??
      asString(value["endpoint"]) ??
      asString(value["url"]) ??
      asString(value["route"]);
    const name = asString(value["name"]) ?? asString(value["title"]);
    const description = asString(value["description"]) ?? asString(value["summary"]) ?? asString(value["details"]);
    const primaryParts = [];
    if (method) primaryParts.push(method.toUpperCase());
    if (path) primaryParts.push(path);
    if (!path && name) primaryParts.push(name);
    const primary = primaryParts.join(" ");
    if (primary && description) return `${primary} – ${description}`;
    if (primary) return primary;
    if (description) return description;
  }
  return undefined;
}

function asEndpointArray(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(
      value
        .map((item) => endpointToString(item))
        .filter((item) => Boolean(item))
    );
  }
  const single = endpointToString(value);
  return single ? [single] : [];
}

function normalizeStrategicPillar(pillar) {
  if (pillar == null) return null;
  if (typeof pillar === "string") {
    const text = pillar.trim();
    if (!text) return null;
    return {
      title: text,
      summary: undefined,
      problem: undefined,
      valueAdd: undefined,
      nextSteps: [],
      supportingAssets: [],
      implementationNotes: [],
      apiEndpoints: [],
    };
  }
  if (typeof pillar === "object" && !Array.isArray(pillar)) {
    const title =
      asString(pillar["use_case"]) ??
      asString(pillar["title"]) ??
      asString(pillar["name"]) ??
      asString(pillar["problem"]) ??
      asString(pillar["summary"]) ??
      "Strategic Pillar";
    return {
      title,
      summary: asString(pillar["summary"]),
      problem: asString(pillar["problem"]),
      valueAdd: asString(pillar["value_add"]),
      nextSteps: dedupeStrings(asStringArray(pillar["next_steps"])),
      supportingAssets: dedupeStrings(asStringArray(pillar["supporting_assets"])),
      implementationNotes: dedupeStrings(asStringArray(pillar["implementation_notes"])),
      apiEndpoints: asEndpointArray(
        pillar["api_endpoints"] ?? pillar["endpoints"] ?? pillar["key_endpoints"] ?? pillar["api_surface"]
      ),
    };
  }
  const fallback = String(pillar).trim();
  if (!fallback) return null;
  return {
    title: fallback,
    summary: undefined,
    problem: undefined,
    valueAdd: undefined,
    nextSteps: [],
    supportingAssets: [],
    implementationNotes: [],
    apiEndpoints: [],
  };
}

const samplePillars = [
  {
    use_case: "Improve onboarding flow",
    problem: "New users drop off before completing setup",
    value_add: "Reduce time-to-value",
    next_steps: ["Ship guided product tour", "Instrument analytics"],
    supporting_assets: ["designs/onboarding-v3.fig"],
    implementation_notes: ["Coordinate with design", "Add success metrics"],
    api_endpoints: [
      { method: "get", path: "/api/onboarding/state", description: "Fetch onboarding progress" },
      "POST /api/onboarding/complete",
    ],
  },
  "Automate manual reporting",
  {
    title: "Expand integrations marketplace",
    summary: "Focus on top partner requests",
    endpoints: "GET /api/integrations",
  },
  {
    problem: "",
    value_add: "",
    next_steps: [""],
    supporting_assets: [],
    implementation_notes: ["   "],
  },
  null,
];

const normalized = samplePillars
  .map(normalizeStrategicPillar)
  .filter((pillar) => pillar !== null);

console.log("Normalized pillar output:\n", JSON.stringify(normalized, null, 2));

if (normalized.some((pillar) => typeof pillar.title !== "string")) {
  throw new Error("Spot check failed: pillar title is not a string");
}

if (normalized.some((pillar) => pillar.nextSteps.some((item) => typeof item !== "string"))) {
  throw new Error("Spot check failed: next steps contains non-string entries");
}

if (normalized.some((pillar) => pillar.apiEndpoints.some((item) => typeof item !== "string"))) {
  throw new Error("Spot check failed: API endpoints contains non-string entries");
}

console.log("Spot check passed: normalization produced render-safe values.");
