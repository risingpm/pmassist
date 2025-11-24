import { useMemo } from "react";
import { getStoredAgentName } from "../utils/agentProfile";

export function useAgentName() {
  return useMemo(() => getStoredAgentName(), []);
}

export default useAgentName;
