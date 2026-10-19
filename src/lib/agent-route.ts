import "server-only";
import { resolveBearer, type BearerActor } from "@/lib/api-key";
import { findAgentByKeyHash, getAgentBySlug } from "@/lib/data";
import type { Agent, DocAction, Priority, TaskStatus } from "@/lib/types";
import { isIsoDate } from "@/lib/time";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function authenticate(req: Request): Promise<BearerActor | Response> {
  const actor = await resolveBearer(
    req.headers.get("authorization"),
    process.env.ADMIN_API_KEY,
    findAgentByKeyHash,
  );
  if (!actor) return jsonError("Unauthorized", 401);
  return actor;
}

export function isResponse<T>(value: T | Response): value is Response {
  return value instanceof Response;
}

/** Admin must name an agent. An agent key may only act as itself. */
export async function agentForWrite(
  actor: BearerActor,
  requestedSlug: unknown,
): Promise<Agent | Response> {
  if (actor.admin) {
    if (typeof requestedSlug !== "string" || !requestedSlug.trim()) {
      return jsonError("Admin requests must include an agent slug", 400);
    }
    const agent = await getAgentBySlug(requestedSlug.trim());
    if (!agent) return jsonError("Unknown agent", 404);
    return agent;
  }
  if (requestedSlug !== undefined && requestedSlug !== actor.agent.slug) {
    return jsonError("This key cannot act for another agent", 403);
  }
  const agent = await getAgentBySlug(actor.agent.slug);
  if (!agent) return jsonError("Unknown agent", 404);
  return agent;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Expected a JSON body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Expected a JSON object", 400);
  }
  return body as Record<string, unknown>;
}

export function asPriority(value: unknown, fallback: Priority = "normal"): Priority | Response {
  if (value === undefined) return fallback;
  if (value === "low" || value === "normal" || value === "high") return value;
  return jsonError("Priority must be low, normal, or high", 400);
}

export function asStatus(value: unknown): TaskStatus | Response {
  if (value === "todo" || value === "doing" || value === "done") return value;
  return jsonError("Status must be todo, doing, or done", 400);
}

export function asAction(value: unknown): DocAction | Response {
  if (value === "created" || value === "edited" || value === "moved" || value === "archived") return value;
  return jsonError("Action must be created, edited, moved, or archived", 400);
}

export function asStringArray(value: unknown, field: string): string[] | Response {
  if (!Array.isArray(value)) return jsonError(`${field} must be an array of strings`, 400);
  if (value.length > 100) return jsonError(`${field} has too many items`, 400);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return jsonError(`${field} must be an array of strings`, 400);
    const trimmed = item.trim();
    if (!trimmed) return jsonError(`${field} cannot contain blank items`, 400);
    if (trimmed.length > 300) return jsonError(`${field} items must be 300 characters or fewer`, 400);
    out.push(trimmed);
  }
  return out;
}

export function asText(value: unknown, field: string, max: number, required: boolean): string | null | Response {
  if (value === undefined || value === null) {
    if (required) return jsonError(`${field} is required`, 400);
    return null;
  }
  if (typeof value !== "string") return jsonError(`${field} must be a string`, 400);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) return jsonError(`${field} is required`, 400);
    return null;
  }
  if (trimmed.length > max) return jsonError(`${field} must be ${max} characters or fewer`, 400);
  return trimmed;
}

export function asDate(value: unknown, fallback: string): string | Response {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !isIsoDate(value)) return jsonError("date must be YYYY-MM-DD", 400);
  return value;
}
