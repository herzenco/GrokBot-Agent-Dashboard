import "server-only";
import { authenticate, isResponse, jsonError } from "@/lib/agent-route";
import type { BearerActor } from "@/lib/api-key";
import { listAgents } from "@/lib/data";
import type { Agent, Task } from "@/lib/types";
import { findTaskByKey } from "@/lib/work-db";

export async function authorizeTask(
  req: Request,
  key: string,
): Promise<{ actor: BearerActor; task: Task; owner: Agent; agents: Agent[] } | Response> {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const task = await findTaskByKey(key);
  if (!task) return jsonError("Task not found", 404);
  if (!actor.admin && task.agent_id !== actor.agent.id) return jsonError("Task not found", 404);
  const agents = await listAgents();
  const owner = agents.find((agent) => agent.id === task.agent_id);
  if (!owner) return jsonError("Task not found", 404);
  return { actor, task, owner, agents };
}
