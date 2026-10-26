import { noteAgentApiCall } from "@/lib/agent-activity";
import { authenticate, asPriority, asStatus, asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { getTask, listAgents } from "@/lib/data";
import { applyTaskPatch } from "@/lib/mutations";
import { isUuid } from "@/lib/url";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Task not found", 404);
  const current = await getTask(id);
  if (!current) return jsonError("Task not found", 404);
  if (!actor.admin && current.agent_id !== actor.agent.id) return jsonError("Task not found", 404);

  const body = await readJson(req);
  if (isResponse(body)) return body;

  const agents = await listAgents();
  const owner = agents.find((agent) => agent.id === current.agent_id);
  if (!owner) return jsonError("Task not found", 404);

  const patch: Parameters<typeof applyTaskPatch>[1] = {};
  if ("title" in body) {
    const title = asText(body.title, "title", 200, true);
    if (isResponse(title) || !title) return isResponse(title) ? title : jsonError("Title is required", 400);
    patch.title = title;
  }
  if ("details" in body) {
    const details = asText(body.details, "details", 5000, false);
    if (isResponse(details)) return details;
    patch.details = details;
  }
  if ("priority" in body) {
    const priority = asPriority(body.priority, "normal");
    if (body.priority === undefined) return jsonError("Priority must be low, normal, or high", 400);
    if (isResponse(priority)) return priority;
    patch.priority = priority;
  }
  if ("status" in body) {
    const status = asStatus(body.status);
    if (isResponse(status)) return status;
    patch.status = status;
  }
  if ("blocked" in body) {
    if (typeof body.blocked !== "boolean") return jsonError("blocked must be true or false", 400);
    patch.blocked = body.blocked;
  }
  if ("blocked_note" in body) {
    const note = asText(body.blocked_note, "blocked_note", 1000, false);
    if (isResponse(note)) return note;
    patch.blocked_note = note;
  }
  if ("blocked_reason" in body) {
    const reason = asText(body.blocked_reason, "blocked_reason", 1000, false);
    if (isResponse(reason)) return reason;
    patch.blocked_reason = reason;
  }
  if ("unblock_needed" in body) {
    const needed = asText(body.unblock_needed, "unblock_needed", 1000, false);
    if (isResponse(needed)) return needed;
    patch.unblock_needed = needed;
  }
  const keyAgent = actor.admin ? owner : (agents.find((agent) => agent.id === actor.agent.id) ?? owner);
  let acting = keyAgent;
  if ("agent" in body) {
    if (!actor.admin && body.agent !== actor.agent.slug) {
      return jsonError("This key cannot act for another agent", 403);
    }
    if (typeof body.agent !== "string") return jsonError("agent must be a slug", 400);
    const next = agents.find((agent) => agent.slug === body.agent);
    if (!next) return jsonError("Unknown agent", 404);
    if (actor.admin) {
      patch.agent_id = next.id;
      acting = next;
    }
  }

  const actorSlug = actor.admin ? owner.slug : actor.agent.slug;
  const result = await applyTaskPatch(id, patch, actorSlug);
  if ("error" in result) {
    const status = result.error === "Task not found" ? 404 : 400;
    return jsonError(result.error, status);
  }
  await noteAgentApiCall(acting);
  const slug = agents.find((agent) => agent.id === result.task.agent_id)?.slug ?? owner.slug;
  return Response.json({ ...result.task, agent: slug });
}
