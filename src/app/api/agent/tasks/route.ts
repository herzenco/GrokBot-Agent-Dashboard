import { noteAgentApiCall } from "@/lib/agent-activity";
import { agentForWrite, authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { listAgents, listTasks, listTasksForAgent } from "@/lib/data";
import { createTaskForAgent } from "@/lib/mutations";
import { mergeExternalRefs, parseTaskCreate, parseTaskQuery, taskMatchesQuery } from "@/lib/work";
import { presentStoredTask, presentStoredTasks, resolveTaskRelations } from "@/lib/work-db";

export async function GET(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const url = new URL(req.url);
  const requested = url.searchParams.get("agent");
  const parsed = parseTaskQuery(url.searchParams);
  if (!parsed.ok) return jsonError(parsed.error, 400);
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
  const filtered = presented.filter((task) => taskMatchesQuery(task, parsed.query));
  if (!actor.admin) return Response.json({ agent: actor.agent.slug, tasks: filtered });
  if (requested) return Response.json({ agent: requested, tasks: filtered });
  return Response.json({ tasks: filtered });
}

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;
  const parsed = parseTaskCreate(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const agents = await listAgents();
  const relations = await resolveTaskRelations(
    { project: parsed.value.project, assignee: parsed.value.assignee, parent: parsed.value.parent },
    agents,
  );
  if ("error" in relations) return jsonError(relations.error, 400);
  const refs = parsed.value.external_refs ? mergeExternalRefs({}, parsed.value.external_refs) : { ok: true as const, refs: {} };
  if (!refs.ok) return jsonError(refs.error, 400);
  const value = parsed.value;
  const task = await createTaskForAgent({
    agent,
    title: value.title ?? "",
    details: value.details ?? null,
    priority: value.priority ?? "medium",
    status: value.status ?? "todo",
    actor: agent.slug,
    blocked: value.blocked,
    blockedNote: value.blocked_note,
    blockedReason: value.blocked_reason,
    unblockNeeded: value.unblock_needed,
    waitingOn: value.waiting_on,
    sourceUrl: value.source_url,
    projectId: relations.project_id,
    assigneeAgentId: relations.assignee_agent_id,
    assigneeHerzen: relations.assignee_herzen,
    dueOn: value.due_on,
    parentId: relations.parent_id,
    externalRefs: refs.refs,
    labels: value.labels,
    links: value.links,
  });
  await noteAgentApiCall(agent);
  const presented = await presentStoredTask(task);
  return Response.json(presented, { status: 201 });
}
