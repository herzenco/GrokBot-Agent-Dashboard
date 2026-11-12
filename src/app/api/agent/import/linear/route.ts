import { authenticate, isResponse, jsonError } from "@/lib/agent-route";
import { parseLinearBatch } from "@/lib/linear-import";
import { importLinearIssues } from "@/lib/work-db";

export async function POST(req: Request) {
  const actor = await authenticate(req);
  if (isResponse(actor)) return actor;
  if (!actor.admin) return jsonError("Only the admin key can import issues", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Expected a JSON array of issues", 400);
  }
  const parsed = parseLinearBatch(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const result = await importLinearIssues(body);
  if ("error" in result) return jsonError(result.error, 400);
  return Response.json(result);
}
