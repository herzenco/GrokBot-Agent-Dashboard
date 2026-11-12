import { noteAgentApiCall } from "@/lib/agent-activity";
import { asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { authorizeTask } from "@/lib/task-access";
import { deleteComment, getComment, updateComment } from "@/lib/work-db";
import { isUuid } from "@/lib/url";

async function commentActor(req: Request, taskKey: string, commentId: string) {
  if (!isUuid(commentId)) return jsonError("Comment not found", 404);
  const access = await authorizeTask(req, taskKey);
  if (isResponse(access)) return access;
  const comment = await getComment(commentId);
  if (!comment || comment.task_id !== access.task.id) return jsonError("Comment not found", 404);
  const actor = access.actor.admin ? "admin" : access.actor.agent.slug;
  if (!access.actor.admin && comment.author !== access.actor.agent?.slug) return jsonError("Comment not found", 404);
  const acting = access.actor.admin
    ? access.owner
    : (access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner);
  return { access, comment, actor, acting };
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await context.params;
  const loaded = await commentActor(req, id, commentId);
  if (isResponse(loaded)) return loaded;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const text = asText(body.body, "body", 8000, true);
  if (isResponse(text) || !text) return isResponse(text) ? text : jsonError("body is required", 400);
  const result = await updateComment(loaded.comment.id, text, loaded.actor === "admin" ? "herzen" : loaded.actor);
  if ("error" in result) return jsonError(result.error, 404);
  await noteAgentApiCall(loaded.acting);
  return Response.json(result);
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await context.params;
  const loaded = await commentActor(req, id, commentId);
  if (isResponse(loaded)) return loaded;
  const result = await deleteComment(loaded.comment.id, loaded.actor);
  if ("error" in result) return jsonError(result.error, 404);
  await noteAgentApiCall(loaded.acting);
  return Response.json(result);
}
