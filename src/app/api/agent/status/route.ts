import { noteAgentApiCall } from "@/lib/agent-activity";
import { agentForWrite, authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { parseStatusBody } from "@/lib/live";
import { recordHeartbeat } from "@/lib/mutations";

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;
  const parsed = parseStatusBody(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const heartbeat = await recordHeartbeat({
    agent,
    state: parsed.state,
    workingOn: parsed.workingOn,
  });
  await noteAgentApiCall(agent);
  return Response.json(heartbeat);
}
