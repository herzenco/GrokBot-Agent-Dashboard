import { noteAgentApiCall } from "@/lib/agent-activity";
import { agentForWrite, authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { listAgents, listOutreach } from "@/lib/data";
import { createOutreach } from "@/lib/mutations";
import { outreachListScope, parseOutreachCreate, parseOutreachStatusFilter, toOutreachApi } from "@/lib/outreach";

export async function GET(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;

  const url = new URL(req.url);
  const statusFilter = parseOutreachStatusFilter(url.searchParams.get("status"));
  if (statusFilter && typeof statusFilter === "object") return jsonError(statusFilter.error, 400);

  const scope = outreachListScope({
    admin: actor.admin,
    actorSlug: actor.admin ? null : actor.agent.slug,
    requestedAgent: url.searchParams.get("agent"),
  });
  if (!scope.ok) return jsonError(scope.error, scope.status);

  const agents = await listAgents();
  let agentId: string | undefined;
  if (scope.agentSlug) {
    const agent = agents.find((item) => item.slug === scope.agentSlug);
    if (!agent) return jsonError("Unknown agent", 404);
    agentId = agent.id;
  }

  const rows = await listOutreach({ agentId, status: statusFilter ?? undefined });
  const slugById = new Map(agents.map((agent) => [agent.id, agent.slug]));
  return Response.json({
    items: rows.map((row) => toOutreachApi(row, slugById.get(row.agent_id) ?? "unknown")),
  });
}

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;

  const parsed = parseOutreachCreate(body, new Date().toISOString());
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const row = await createOutreach({ agent, value: parsed.value });
  await noteAgentApiCall(agent);
  return Response.json(toOutreachApi(row, agent.slug), { status: 201 });
}
