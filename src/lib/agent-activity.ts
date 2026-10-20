import "server-only";
import { db } from "@/lib/db";
import type { Agent } from "@/lib/types";

/**
 * Count a successful agent API call as presence.
 * The timestamp is the application server's clock, never a value from the request body.
 */
export async function noteAgentApiCall(agent: Pick<Agent, "id">): Promise<void> {
  const { error } = await db().from("agents").update({ last_active: new Date().toISOString() }).eq("id", agent.id);
  if (error) throw new Error(error.message);
}
