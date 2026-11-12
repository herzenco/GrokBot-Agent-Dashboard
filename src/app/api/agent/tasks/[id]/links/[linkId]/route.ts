import { noteAgentApiCall } from "@/lib/agent-activity";
import { asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { authorizeTask } from "@/lib/task-access";
import type { LinkKind } from "@/lib/types";
import { isHttpUrl, isUuid } from "@/lib/url";
import { LINK_KINDS } from "@/lib/work";
import { deleteTaskLink, listTaskLinks, updateTaskLink } from "@/lib/work-db";

async function loadLink(req: Request, taskKey: string, linkId: string) {
  if (!isUuid(linkId)) return jsonError("Link not found", 404);
  const access = await authorizeTask(req, taskKey);
  if (isResponse(access)) return access;
  const links = await listTaskLinks(access.task.id);
  const link = links.find((item) => item.id === linkId);
  if (!link) return jsonError("Link not found", 404);
  const acting = access.actor.admin
    ? access.owner
    : (access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner);
  return { access, link, acting };
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await context.params;
  const loaded = await loadLink(req, id, linkId);
  if (isResponse(loaded)) return loaded;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const patch: { kind?: LinkKind; url?: string; label?: string | null } = {};
  if ("url" in body) {
    const url = asText(body.url, "url", 1000, true);
    if (isResponse(url) || !url) return isResponse(url) ? url : jsonError("url is required", 400);
    if (!isHttpUrl(url)) return jsonError("url must be http or https", 400);
    patch.url = url;
  }
  if ("label" in body) {
    const label = asText(body.label, "label", 200, false);
    if (isResponse(label)) return label;
    patch.label = label;
  }
  if ("kind" in body) {
    if (typeof body.kind !== "string" || !LINK_KINDS.includes(body.kind as LinkKind)) {
      return jsonError("link kind must be pr, issue, doc, deploy, or other", 400);
    }
    patch.kind = body.kind as LinkKind;
  }
  const result = await updateTaskLink(loaded.link.id, patch);
  if ("error" in result) return jsonError(result.error, 404);
  await noteAgentApiCall(loaded.acting);
  return Response.json(result);
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await context.params;
  const loaded = await loadLink(req, id, linkId);
  if (isResponse(loaded)) return loaded;
  const removed = await deleteTaskLink(loaded.link.id, loaded.acting.slug);
  if (!removed) return jsonError("Link not found", 404);
  await noteAgentApiCall(loaded.acting);
  return Response.json(removed);
}
