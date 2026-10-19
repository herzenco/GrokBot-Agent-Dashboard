import { authenticate, asPriority, asText, agentForWrite, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { listAgents, listTasks, listTasksForAgent } from "@/lib/data";
import { createTaskForAgent } from "@/lib/mutations";
import type { Task } from "@/lib/types";

function present(task: Task, slugById: Map<string, string>) {
  return { ...task, agent: slugById.get(task.agent_id) ?? null };
}

export async function GET(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const requested = new URL(req.url).searchParams.get("agent");
  const agents = await listAgents();
  const slugById = new Map(agents.map((agent) => [agent.id, agent.slug]));

  if (actor.admin) {
    if (requested) {
      const agent = agents.find((item) => item.slug === requested);
      if (!agent) return jsonError("Unknown agent", 404);
      const tasks = await listTasksForAgent(agent.id);
      return Response.json({ agent: agent.slug, tasks: tasks.map((task) => present(task, slugById)) });
    }
    const tasks = await listTasks();
    return Response.json({ tasks: tasks.map((task) => present(task, slugById)) });
  }

  if (requested && requested !== actor.agent.slug) return jsonError("This key cannot read another agent's tasks", 403);
  const tasks = await listTasksForAgent(actor.agent.id);
  return Response.json({ agent: actor.agent.slug, tasks: tasks.map((task) => present(task, slugById)) });
}

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;
  const title = asText(body.title, "title", 200, true);
  if (isResponse(title) || !title) return isResponse(title) ? title : jsonError("Title is required", 400);
  const details = asText(body.details, "details", 5000, false);
  if (isResponse(details)) return details;
  const priority = asPriority(body.priority);
  if (isResponse(priority)) return priority;
  const status = body.status;
  if (status !== undefined && status !== "todo") return jsonError("New tasks start as todo", 400);

  const task = await createTaskForAgent({
    agent,
    title,
    details,
    priority,
    actor: agent.slug,
  });
  return Response.json({ ...task, agent: agent.slug }, { status: 201 });
}
