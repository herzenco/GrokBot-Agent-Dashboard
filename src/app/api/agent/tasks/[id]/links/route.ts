import { noteAgentApiCall } from "@/lib/agent-activity";
import { asText, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { authorizeTask } from "@/lib/task-access";
import type { LinkKind } from "@/lib/types";
import { LINK_KINDS, inferLinkKind } from "@/lib/work";
import { ensureTaskLink, listTaskLinks } from "@/lib/work-db";
import { isHttpUrl } from "@/lib/url";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  return Response.json({ links: await listTaskLinks(access.task.id) });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const url = asText(body.url, "url", 1000, true);
  if (isResponse(url) || !url) return isResponse(url) ? url : jsonError("url is required", 400);
  if (!isHttpUrl(url)) return jsonError("url must be http or https", 400);
  const label = asText(body.label, "label", 200, false);
  if (isResponse(label)) return label;
  let kind = inferLinkKind(url);
  if (body.kind !== undefined) {
    if (typeof body.kind !== "string" || !LINK_KINDS.includes(body.kind as LinkKind)) {
      return jsonError("link kind must be pr, issue, doc, deploy, or other", 400);
    }
    kind = body.kind as LinkKind;
  }
  const actor = access.actor.admin ? access.owner.slug : access.actor.agent.slug;
  const link = await ensureTaskLink({
    taskId: access.task.id,
    url,
    kind,
    label,
    createdBy: actor,
  });
  const acting = access.actor.admin
    ? access.owner
    : (access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner);
  await noteAgentApiCall(acting);
  return Response.json(link, { status: 201 });
}
