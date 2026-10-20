import type { Agent } from "@/lib/types";

/** Documents list and history show the agent stored on the event. */
export function documentAgentName(agents: Pick<Agent, "id" | "name">[], agentId: string | null | undefined): string {
  if (!agentId) return "Unknown agent";
  return agents.find((agent) => agent.id === agentId)?.name ?? "Unknown agent";
}
