import type { ResolutionState, TaskComment } from "@/lib/types";

export function isPendingResolution(task: {
  resolution_pending?: boolean | null;
  resolution_state?: string | null;
}): boolean {
  if (task.resolution_pending === true) return true;
  return task.resolution_state === "awaiting_agent";
}

/** When a block clears, a pending resolution is acknowledged in the same write. */
export function resolutionAfterUnblock(
  current: {
    blocked: boolean;
    resolution_pending?: boolean | null;
    resolution_state?: string | null;
  },
  nextBlocked: boolean,
  acknowledgedAt: string,
): {
  resolution_state: "acknowledged";
  resolution_pending: false;
  resolution_acknowledged_at: string;
} | null {
  if (!current.blocked || nextBlocked || !isPendingResolution(current)) return null;
  return {
    resolution_state: "acknowledged",
    resolution_pending: false,
    resolution_acknowledged_at: acknowledgedAt,
  };
}

export function parseResolutionAck(
  body: Record<string, unknown>,
): { ok: true; reply: string | null; blocked?: boolean } | { ok: false; error: string } {
  let reply: string | null = null;
  if ("reply" in body && body.reply !== undefined && body.reply !== null) {
    if (typeof body.reply !== "string") return { ok: false, error: "reply must be a string" };
    const trimmed = body.reply.trim();
    if (trimmed.length > 8000) return { ok: false, error: "reply must be 8000 characters or fewer" };
    reply = trimmed || null;
  }
  let blocked: boolean | undefined;
  if ("blocked" in body && body.blocked !== undefined) {
    if (typeof body.blocked !== "boolean") return { ok: false, error: "blocked must be true or false" };
    blocked = body.blocked;
  }
  return { ok: true, reply, blocked };
}

export type PublicResolution = {
  id: string;
  author: string;
  body: string;
  kind: "resolution";
  created_at: string;
};

export function toPublicResolution(comment: Pick<TaskComment, "id" | "author" | "body" | "created_at"> | null): PublicResolution | null {
  if (!comment) return null;
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body,
    kind: "resolution",
    created_at: comment.created_at,
  };
}

export function resolutionStateOf(task: {
  resolution_state?: string | null;
  resolution_pending?: boolean | null;
}): ResolutionState {
  if (task.resolution_state === "awaiting_agent" || task.resolution_state === "acknowledged" || task.resolution_state === "none") {
    return task.resolution_state;
  }
  return task.resolution_pending ? "awaiting_agent" : "none";
}
