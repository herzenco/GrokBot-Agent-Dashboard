import { authenticate, isResponse, jsonError } from "@/lib/agent-route";
import { listAgents, listTasks, listTasksForAgent } from "@/lib/data";
import { isPendingResolution, toPublicResolution } from "@/lib/resolutions";
import { attachPendingResolutions, presentStoredTasks } from "@/lib/work-db";

export async function GET(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const url = new URL(req.url);
  const requested = url.searchParams.get("agent");
  const agents = await listAgents();

  let tasks;
  if (actor.admin) {
    if (requested) {
      const agent = agents.find((item) => item.slug === requested);
      if (!agent) return jsonError("Unknown agent", 404);
      tasks = await listTasksForAgent(agent.id);
    } else {
      tasks = await listTasks();
    }
  } else {
    if (requested && requested !== actor.agent.slug) return jsonError("This key cannot read another agent's tasks", 403);
    tasks = await listTasksForAgent(actor.agent.id);
  }

  const presented = await presentStoredTasks(tasks);
  const pending = presented.filter((task) => isPendingResolution(task));
  const attached = await attachPendingResolutions(pending);
  const resolutions = attached.map((task) => ({
    task_id: task.id,
    identifier: task.identifier ?? null,
    title: task.title,
    agent: task.agent,
    blocked: task.blocked,
    blocked_reason: task.blocked_reason ?? null,
    blocked_note: task.blocked_note ?? null,
    waiting_on: task.waiting_on ?? null,
    resolution_state: task.resolution_state ?? "awaiting_agent",
    latest_resolution_at: task.latest_resolution_at ?? task.pending_resolution?.created_at ?? null,
    resolution: toPublicResolution(task.pending_resolution),
  }));

  if (!actor.admin) return Response.json({ agent: actor.agent.slug, resolutions });
  if (requested) return Response.json({ agent: requested, resolutions });
  return Response.json({ resolutions });
}
