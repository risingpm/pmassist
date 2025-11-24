import { AGENT_PROFILE_KEY, DEFAULT_AGENT_NAME } from "../constants";

type AgentProfile = {
  name: string;
};

export function getStoredAgentProfile(): AgentProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(AGENT_PROFILE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgentProfile;
    if (parsed && typeof parsed.name === "string") {
      return { name: parsed.name.trim() || DEFAULT_AGENT_NAME };
    }
  } catch {
    return null;
  }
  return null;
}

export function setStoredAgentProfile(profile: AgentProfile | null) {
  if (typeof window === "undefined") return;
  if (!profile) {
    window.sessionStorage.removeItem(AGENT_PROFILE_KEY);
    return;
  }
  window.sessionStorage.setItem(
    AGENT_PROFILE_KEY,
    JSON.stringify({
      name: profile.name?.trim() || DEFAULT_AGENT_NAME,
    })
  );
}

export function getStoredAgentName(): string {
  return getStoredAgentProfile()?.name || DEFAULT_AGENT_NAME;
}
