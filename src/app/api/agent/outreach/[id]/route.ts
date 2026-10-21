import { noteAgentApiCall } from "@/lib/agent-activity";
import { authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { getOutreach, listAgents } from "@/lib/data";
import { updateOutreach } from "@/lib/mutations";
import { canAccessOutreach, mergedHasContact, parseOutreachPatch, toOutreachApi } from "@/lib/outreach";
import { isUuid } from "@/lib/url";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Outreach not found", 404);

  const current = await getOutreach(id);
  if (!current) return jsonError("Outreach not found", 404);
  if (!canAccessOutreach({ admin: actor.admin, actorId: actor.admin ? null : actor.agent.id, rowAgentId: current.agent_id })) {
    return jsonError("Outreach not found", 404);
  }

  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = parseOutreachPatch(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (!mergedHasContact(current, parsed.value)) return jsonError("email or linkedin_url is required", 400);

  const agents = await listAgents();
  const owner = agents.find((agent) => agent.id === current.agent_id);
  if (!owner) return jsonError("Outreach not found", 404);

  let acting = owner;
  let nextAgentId: string | undefined;
  if ("agent" in body) {
    if (!actor.admin && body.agent !== actor.agent.slug) {
      return jsonError("This key cannot act for another agent", 403);
    }
    if (typeof body.agent !== "string" || !body.agent.trim()) return jsonError("agent must be a slug", 400);
    const next = agents.find((agent) => agent.slug === body.agent);
    if (!next) return jsonError("Unknown agent", 404);
    if (actor.admin && next.id !== current.agent_id) {
      nextAgentId = next.id;
      acting = next;
    }
  }

  if (Object.keys(parsed.value).length === 0 && !nextAgentId) {
    return jsonError("Send at least one field to update", 400);
  }

  const row = await updateOutreach(id, { ...parsed.value, agentId: nextAgentId }, acting, current.status);
  await noteAgentApiCall(acting);
  const slug = agents.find((agent) => agent.id === row.agent_id)?.slug ?? acting.slug;
  return Response.json(toOutreachApi(row, slug));
}
