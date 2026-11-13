import { noteAgentApiCall } from "@/lib/agent-activity";
import { isResponse, jsonError, readJson } from "@/lib/agent-route";
import { asText } from "@/lib/agent-route";
import { authorizeTask } from "@/lib/task-access";
import { addComment, listComments } from "@/lib/work-db";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const comments = await listComments(access.task.id);
  return Response.json({ comments });
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await authorizeTask(req, id);
  if (isResponse(access)) return access;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  if ("kind" in body && body.kind !== undefined && body.kind !== "comment") {
    return jsonError("kind must be comment. Resolutions are posted from Agent HQ", 400);
  }
  const text = asText(body.body, "body", 8000, true);
  if (isResponse(text) || !text) return isResponse(text) ? text : jsonError("body is required", 400);
  let author = access.actor.admin ? "herzen" : access.actor.agent.slug;
  let acting = access.owner;
  if (access.actor.admin && typeof body.agent === "string" && body.agent.trim()) {
    const agent = access.agents.find((item) => item.slug === body.agent);
    if (!agent) return jsonError("Unknown agent", 404);
    author = agent.slug;
    acting = agent;
  } else if (!access.actor.admin) {
    acting = access.agents.find((agent) => agent.id === access.actor.agent?.id) ?? access.owner;
  }
  const comment = await addComment({ task: access.task, author, body: text });
  await noteAgentApiCall(acting);
  return Response.json(comment, { status: 201 });
}
