"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { agentById, applyTaskPatch, createTaskForAgent } from "@/lib/mutations";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import type { Priority, TaskStatus } from "@/lib/types";
import { isUuid } from "@/lib/url";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function gate(): Promise<ActionResult | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const ok = await verifySession(token, process.env.SESSION_SECRET ?? "");
  if (!ok) return { ok: false, error: "Your session expired. Log in again." };
  return null;
}

function refresh() {
  revalidatePath("/", "layout");
}

function asPriority(value: string): Priority | null {
  if (value === "low" || value === "normal" || value === "high") return value;
  return null;
}

function asStatus(value: string): TaskStatus | null {
  if (value === "todo" || value === "doing" || value === "done") return value;
  return null;
}

export async function createTaskAction(input: {
  title: string;
  details: string;
  agentId: string;
  priority: string;
}): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required" };
  if (title.length > 200) return { ok: false, error: "Title must be 200 characters or fewer" };
  const details = input.details.trim();
  if (details.length > 5000) return { ok: false, error: "Details must be 5000 characters or fewer" };
  const priority = asPriority(input.priority);
  if (!priority) return { ok: false, error: "Pick a priority" };
  if (!isUuid(input.agentId)) return { ok: false, error: "Pick an agent" };
  const agent = await agentById(input.agentId);
  if (!agent) return { ok: false, error: "Pick an agent" };
  await createTaskForAgent({
    agent,
    title,
    details: details || null,
    priority,
    actor: "tito",
  });
  refresh();
  return { ok: true };
}

async function patchOwned(taskId: string, patch: Parameters<typeof applyTaskPatch>[1]): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  if (!isUuid(taskId)) return { ok: false, error: "Task not found" };
  const result = await applyTaskPatch(taskId, patch, "tito");
  if ("error" in result) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}

export async function setTaskStatusAction(taskId: string, status: string): Promise<ActionResult> {
  const next = asStatus(status);
  if (!next) return { ok: false, error: "Unknown status" };
  return patchOwned(taskId, { status: next });
}

export async function setTaskPriorityAction(taskId: string, priority: string): Promise<ActionResult> {
  const next = asPriority(priority);
  if (!next) return { ok: false, error: "Unknown priority" };
  return patchOwned(taskId, { priority: next });
}

export async function reassignTaskAction(taskId: string, agentId: string): Promise<ActionResult> {
  if (!isUuid(agentId)) return { ok: false, error: "Unknown agent" };
  const agent = await agentById(agentId);
  if (!agent) return { ok: false, error: "Unknown agent" };
  return patchOwned(taskId, { agent_id: agent.id });
}

export async function setTaskBlockedAction(
  taskId: string,
  blocked: boolean,
  note: string,
  blockedReason?: string | null,
  unblockNeeded?: string | null,
): Promise<ActionResult> {
  const trimmed = note.trim();
  const reason = typeof blockedReason === "string" ? blockedReason.trim() : "";
  const needed = typeof unblockNeeded === "string" ? unblockNeeded.trim() : "";
  if (trimmed.length > 1000 || reason.length > 1000) {
    return { ok: false, error: "Block note must be 1000 characters or fewer" };
  }
  if (needed.length > 1000) return { ok: false, error: "Unblock note must be 1000 characters or fewer" };
  if (blocked && !trimmed && !reason) return { ok: false, error: "Add a note about what is stuck" };
  return patchOwned(taskId, {
    blocked,
    blocked_note: blocked ? trimmed || reason : null,
    blocked_reason: blocked ? reason || trimmed || null : null,
    unblock_needed: blocked ? needed || null : null,
  });
}
