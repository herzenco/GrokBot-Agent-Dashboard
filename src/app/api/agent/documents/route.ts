import { agentForWrite, asAction, asText, authenticate, isResponse, jsonError, readJson } from "@/lib/agent-route";
import { logDocumentEvent } from "@/lib/mutations";
import { safeHref } from "@/lib/url";

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const agent = await agentForWrite(actor, body.agent);
  if (isResponse(agent)) return agent;
  const title = asText(body.title, "title", 200, true);
  if (isResponse(title) || !title) return isResponse(title) ? title : jsonError("Title is required", 400);
  const vaultPath = asText(body.vault_path, "vault_path", 500, true);
  if (isResponse(vaultPath) || !vaultPath) return isResponse(vaultPath) ? vaultPath : jsonError("vault_path is required", 400);
  const fromPath = asText(body.from_path, "from_path", 500, false);
  if (isResponse(fromPath)) return fromPath;
  const summary = asText(body.change_summary, "change_summary", 2000, true);
  if (isResponse(summary) || !summary) return isResponse(summary) ? summary : jsonError("change_summary is required", 400);
  const action = asAction(body.action);
  if (isResponse(action)) return action;

  let url: string | null | undefined;
  if ("url" in body) {
    if (body.url === null || body.url === "") url = null;
    else {
      const parsed = asText(body.url, "url", 1000, true);
      if (isResponse(parsed) || !parsed) return isResponse(parsed) ? parsed : jsonError("url is invalid", 400);
      if (!safeHref(parsed)) return jsonError("url must be http, https, or obsidian", 400);
      url = parsed;
    }
  }

  const result = await logDocumentEvent({
    agent,
    title,
    vaultPath,
    fromPath,
    url,
    action,
    changeSummary: summary,
  });
  if ("error" in result) {
    const status = result.error.includes("already") ? 409 : 404;
    return jsonError(result.error, status);
  }
  return Response.json(result, { status: 201 });
}
