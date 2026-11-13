import { noteAgentApiCall } from "@/lib/agent-activity";
import { isResponse, jsonError, readJson } from "@/lib/agent-route";
import { applyTaskPatch, type TaskPatch } from "@/lib/mutations";
import { isPendingResolution, parseResolutionAck } from "@/lib/resolutions";
import { authorizeTask } from "@/lib/task-access";
import { parseStatus } from "@/lib/work";
import { acknowledgeResolution, addComment, presentStoredTask } from "@/lib/work-db";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = parseResolutionAck(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  let status: TaskPatch["status"];
  if ("status" in body && body.status !== undefined) {
    const next = parseStatus(body.status);
    if (!next.ok) return jsonError(next.error, 400);
    status = next.status;
  }

  const actorSlug = access.actor.admin ? access.owner.slug : access.actor.agent.slug;
  const wasPending = isPendingResolution(access.task);
  let task = access.task;
  const patching = parsed.blocked !== undefined || status !== undefined;
  if (!wasPending && !patching && !parsed.reply) {
    return jsonError("No resolution is waiting on this task", 409);
  }

  if (patching) {
    const patch: TaskPatch = {};
    if (status) patch.status = status;
    if (parsed.blocked !== undefined) patch.blocked = parsed.blocked;
    const result = await applyTaskPatch(task.id, patch, actorSlug);
    if ("error" in result) return jsonError(result.error, 400);
    task = result.task;
  }

  if (isPendingResolution(task)) {
    const acked = await acknowledgeResolution(task, actorSlug);
    if ("error" in acked) return jsonError(acked.error, 409);
    task = acked.task;
  }

  const reply = parsed.reply ? await addComment({ task, author: actorSlug, body: parsed.reply }) : null;
  const acting = access.actor.admin
    ? access.owner
    : (access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner);
  await noteAgentApiCall(acting);
  const presented = await presentStoredTask(task, true);
  return Response.json({
    ...presented,
    acknowledged: wasPending && !isPendingResolution(task),
    reply,
  });
}
