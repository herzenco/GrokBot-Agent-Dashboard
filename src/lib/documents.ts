import type { Agent } from "@/lib/types";

/** Documents list and history show the agent stored on the event. */
export function documentAgentName(agents: Pick<Agent, "id" | "name">[], agentId: string | null | undefined): string {
  if (!agentId) return "Unknown agent";
  return agents.find((agent) => agent.id === agentId)?.name ?? "Unknown agent";
}

export type MovePlan =
  | { action: "conflict" }
  | { action: "update"; id: string; fromPath: string | null }
  | { action: "insert"; fromPath: string | null };

/**
 * A move renames a logged document when one exists.
 * If nothing is logged at from_path, create or update the destination and keep from_path on the event.
 */
export function planDocumentMove(input: {
  fromPath: string | null;
  vaultPath: string;
  prior: { id: string } | null;
  destination: { id: string } | null;
}): MovePlan {
  const { fromPath, vaultPath, prior, destination } = input;
  if (prior && destination && prior.id !== destination.id && fromPath !== vaultPath) {
    return { action: "conflict" };
  }
  if (prior) return { action: "update", id: prior.id, fromPath };
  if (destination) return { action: "update", id: destination.id, fromPath };
  return { action: "insert", fromPath };
}
