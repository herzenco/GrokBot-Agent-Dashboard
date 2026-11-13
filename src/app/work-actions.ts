"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTask, listAgents } from "@/lib/data";
import { agentById, applyTaskPatch, createTaskForAgent, type TaskPatch } from "@/lib/mutations";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import type { LinkKind, ResolutionState } from "@/lib/types";
import { isUuid } from "@/lib/url";
import { resolutionStateOf, toPublicResolution } from "@/lib/resolutions";
import { parseTaskCreate, parseTaskPatch } from "@/lib/work";
import {
  addComment,
  createProject,
  deleteTaskLink,
  ensureTaskLink,
  findTaskByKey,
  listResolutionComments,
  postHerzenResolution,
  replaceTaskLabels,
  resolveTaskRelations,
  updateProject,
} from "@/lib/work-db";

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

function asRecord(input: Record<string, string | null | undefined>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) body[key] = value;
  }
  return body;
}

export async function createWorkTaskAction(input: {
  title: string;
  details: string;
  agentId: string;
  priority: string;
  status: string;
  project: string;
  assignee: string;
  dueOn: string;
  labels: string;
  parent: string;
}): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const parsed = parseTaskCreate({
    title: input.title,
    details: input.details,
    priority: input.priority,
    status: input.status,
    project: input.project || null,
    assignee: input.assignee || null,
    due_on: input.dueOn || null,
    parent: input.parent || null,
    labels: input.labels.split(",").map((item) => item.trim()).filter(Boolean),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!isUuid(input.agentId)) return { ok: false, error: "Pick an agent" };
  const agent = await agentById(input.agentId);
  if (!agent) return { ok: false, error: "Pick an agent" };
  const agents = await listAgents();
  const relations = await resolveTaskRelations(
    { project: parsed.value.project, assignee: parsed.value.assignee, parent: parsed.value.parent },
    agents,
  );
  if ("error" in relations) return { ok: false, error: relations.error };
  await createTaskForAgent({
    agent,
    title: parsed.value.title ?? "",
    details: parsed.value.details ?? null,
    priority: parsed.value.priority ?? "medium",
    status: parsed.value.status ?? "todo",
    actor: "herzen",
    projectId: relations.project_id,
    assigneeAgentId: relations.assignee_agent_id,
    assigneeHerzen: relations.assignee_herzen,
    dueOn: parsed.value.due_on,
    parentId: relations.parent_id,
    labels: parsed.value.labels,
  });
  refresh();
  return { ok: true };
}

export async function updateWorkTaskAction(
  taskKey: string,
  input: Record<string, string | null | undefined>,
): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const task = await findTaskByKey(taskKey);
  if (!task) return { ok: false, error: "Task not found" };
  const body = asRecord(input);
  if (typeof body.labels === "string") {
    body.labels = body.labels
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const parsed = parseTaskPatch(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const agents = await listAgents();
  const relations = await resolveTaskRelations(
    { project: parsed.value.project, assignee: parsed.value.assignee, parent: parsed.value.parent },
    agents,
  );
  if ("error" in relations) return { ok: false, error: relations.error };
  const value = parsed.value;
  const patch: TaskPatch = {};
  if (value.title !== undefined) patch.title = value.title;
  if (value.details !== undefined) patch.details = value.details;
  if (value.priority !== undefined) patch.priority = value.priority;
  if (value.status !== undefined) patch.status = value.status;
  if (value.blocked !== undefined) patch.blocked = value.blocked;
  if (value.blocked_note !== undefined) patch.blocked_note = value.blocked_note;
  if (value.blocked_reason !== undefined) patch.blocked_reason = value.blocked_reason;
  if (value.unblock_needed !== undefined) patch.unblock_needed = value.unblock_needed;
  if (value.waiting_on !== undefined) patch.waiting_on = value.waiting_on;
  if (value.source_url !== undefined) patch.source_url = value.source_url;
  if (value.due_on !== undefined) patch.due_on = value.due_on;
  if (value.external_refs) patch.external_refs = value.external_refs;
  if (relations.project_id !== undefined) patch.project_id = relations.project_id;
  if (relations.parent_id !== undefined) patch.parent_id = relations.parent_id;
  if (relations.assignee_herzen !== undefined) patch.assignee_herzen = relations.assignee_herzen;
  if (relations.assignee_agent_id !== undefined) patch.assignee_agent_id = relations.assignee_agent_id;
  if (typeof input.agent_id === "string" && input.agent_id) {
    if (!isUuid(input.agent_id)) return { ok: false, error: "Unknown agent" };
    const owner = await agentById(input.agent_id);
    if (!owner) return { ok: false, error: "Unknown agent" };
    patch.agent_id = owner.id;
  }
  const result = await applyTaskPatch(task.id, patch, "herzen");
  if ("error" in result) return { ok: false, error: result.error };
  if (value.labels) await replaceTaskLabels(result.task, value.labels, "herzen");
  refresh();
  return { ok: true };
}

export type ResolutionItem = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

export async function listTaskResolutionsAction(taskId: string): Promise<
  | { ok: true; resolutions: ResolutionItem[]; state: ResolutionState; acknowledgedAt: string | null }
  | { ok: false; error: string }
> {
  const denied = await gate();
  if (denied && !denied.ok) return denied;
  if (!isUuid(taskId)) return { ok: false, error: "Task not found" };
  const task = await getTask(taskId);
  if (!task) return { ok: false, error: "Task not found" };
  const comments = await listResolutionComments(task.id);
  return {
    ok: true,
    resolutions: comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      body: comment.body,
      created_at: comment.created_at,
    })),
    state: resolutionStateOf(task),
    acknowledgedAt: task.resolution_acknowledged_at ?? null,
  };
}

export async function postResolutionAction(
  taskId: string,
  body: string,
): Promise<{ ok: true; resolution: ResolutionItem } | { ok: false; error: string }> {
  const denied = await gate();
  if (denied && !denied.ok) return denied;
  if (!isUuid(taskId)) return { ok: false, error: "Task not found" };
  const task = await getTask(taskId);
  if (!task) return { ok: false, error: "Task not found" };
  const saved = await postHerzenResolution(task, body);
  if ("error" in saved) return { ok: false, error: saved.error };
  const resolution = toPublicResolution(saved);
  if (!resolution) return { ok: false, error: "Could not save the resolution" };
  refresh();
  return {
    ok: true,
    resolution: {
      id: resolution.id,
      author: resolution.author,
      body: resolution.body,
      created_at: resolution.created_at,
    },
  };
}

export async function commentOnTaskAction(taskKey: string, body: string): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const task = await findTaskByKey(taskKey);
  if (!task) return { ok: false, error: "Task not found" };
  const text = body.trim();
  if (!text) return { ok: false, error: "Comment is required" };
  if (text.length > 8000) return { ok: false, error: "Comment must be 8000 characters or fewer" };
  await addComment({ task, author: "herzen", body: text });
  refresh();
  return { ok: true };
}

export async function addTaskLinkAction(
  taskKey: string,
  input: { url: string; kind: string; label: string },
): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const task = await findTaskByKey(taskKey);
  if (!task) return { ok: false, error: "Task not found" };
  const url = input.url.trim();
  if (!url) return { ok: false, error: "url is required" };
  const kinds: LinkKind[] = ["pr", "issue", "doc", "deploy", "other"];
  if (!kinds.includes(input.kind as LinkKind)) return { ok: false, error: "Pick a link type" };
  try {
    await ensureTaskLink({
      taskId: task.id,
      url,
      kind: input.kind as LinkKind,
      label: input.label,
      createdBy: "herzen",
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the link" };
  }
  refresh();
  return { ok: true };
}

export async function removeTaskLinkAction(linkId: string): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  if (!isUuid(linkId)) return { ok: false, error: "Link not found" };
  const removed = await deleteTaskLink(linkId, "herzen");
  if (!removed) return { ok: false, error: "Link not found" };
  refresh();
  return { ok: true };
}

export async function saveProjectAction(input: {
  id?: string;
  name: string;
  description: string;
}): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  const result = input.id
    ? await updateProject(input.id, { name: input.name, description: input.description })
    : await createProject({ name: input.name, description: input.description });
  if ("error" in result) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}

export async function archiveProjectAction(id: string, archived: boolean): Promise<ActionResult> {
  const denied = await gate();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: "Project not found" };
  const result = await updateProject(id, { archived });
  if ("error" in result) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}
