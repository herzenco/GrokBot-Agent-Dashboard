import { noteAgentApiCall } from "@/lib/agent-activity";
import { isResponse, jsonError, readJson } from "@/lib/agent-route";
import { applyTaskPatch, type TaskPatch } from "@/lib/mutations";
import { authorizeTask } from "@/lib/task-access";
import { parseTaskPatch } from "@/lib/work";
import { presentStoredTask, replaceTaskLabels, resolveTaskRelations } from "@/lib/work-db";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  return Response.json(await presentStoredTask(access.task, true));
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = parseTaskPatch(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const patch: TaskPatch = {};
  const value = parsed.value;
  if (value.title !== undefined) patch.title = value.title;
  if (value.details !== undefined) patch.details = value.details;
  if (value.priority !== undefined) patch.priority = value.priority;
  if (value.status !== undefined) patch.status = value.status;
  if (value.blocked !== undefined) patch.blocked = value.blocked;
  if (value.blocked_note !== undefined) patch.blocked_note = value.blocked_note;
  if (value.blocked_reason !== undefined) patch.blocked_reason = value.blocked_reason;
  if (value.unblock_needed !== undefined) patch.unblock_needed = value.unblock_needed;
  if (value.waiting_on !== undefined) patch.waiting_on = value.waiting_on;
  if (value.source_url !== undefined) patch.source_url = value.source_url;
  if (value.due_on !== undefined) patch.due_on = value.due_on;
  if (value.external_refs) patch.external_refs = value.external_refs;

  const relations = await resolveTaskRelations(
    { project: value.project, assignee: value.assignee, parent: value.parent },
    access.agents,
  );
  if ("error" in relations) return jsonError(relations.error, 400);
  if (relations.project_id !== undefined) patch.project_id = relations.project_id;
  if (relations.parent_id !== undefined) patch.parent_id = relations.parent_id;
  if (relations.assignee_herzen !== undefined) patch.assignee_herzen = relations.assignee_herzen;
  if (relations.assignee_agent_id !== undefined) patch.assignee_agent_id = relations.assignee_agent_id;

  let acting = access.owner;
  if ("agent" in body) {
    if (!access.actor.admin && body.agent !== access.actor.agent?.slug) {
      return jsonError("This key cannot act for another agent", 403);
    }
    if (typeof body.agent !== "string") return jsonError("agent must be a slug", 400);
    const next = access.agents.find((agent) => agent.slug === body.agent);
    if (!next) return jsonError("Unknown agent", 404);
    if (access.actor.admin) {
      patch.agent_id = next.id;
      acting = next;
    }
  }

  const actorSlug = access.actor.admin ? access.owner.slug : access.actor.agent.slug;
  const result = await applyTaskPatch(access.task.id, patch, actorSlug);
  if ("error" in result) {
    const status = result.error === "Task not found" ? 404 : 400;
    return jsonError(result.error, status);
  }
  if (value.labels) await replaceTaskLabels(result.task, value.labels, actorSlug);
  await noteAgentApiCall(acting);
  return Response.json(await presentStoredTask(result.task, true));
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const actorSlug = access.actor.admin ? access.owner.slug : access.actor.agent.slug;
  const result = await applyTaskPatch(access.task.id, { status: "canceled" }, actorSlug);
  if ("error" in result) return jsonError(result.error, 400);
  const acting = access.actor.admin
    ? access.owner
    : (access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner);
  await noteAgentApiCall(acting);
  return Response.json(await presentStoredTask(result.task));
}
