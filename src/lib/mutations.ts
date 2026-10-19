import "server-only";
import { db } from "@/lib/db";
import { getTask, listAgents } from "@/lib/data";
import type { Agent, DocAction, Priority, Task, TaskStatus } from "@/lib/types";

const TASK_COLUMNS =
  "id,title,details,agent_id,priority,status,blocked,blocked_note,created_at,updated_at,done_at";

export type TaskPatch = {
  title?: string;
  details?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  blocked?: boolean;
  blocked_note?: string | null;
  agent_id?: string;
};

function quote(title: string): string {
  return `“${title}”`;
}

function statusLabel(status: TaskStatus): string {
  if (status === "todo") return "To do";
  if (status === "doing") return "Doing";
  return "Done";
}

function priorityLabel(priority: Priority): string {
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

async function writeActivity(row: {
  actor: string;
  verb: string;
  summary: string;
  task_id?: string | null;
  document_id?: string | null;
}): Promise<void> {
  const { error } = await db().from("activity").insert({
    actor: row.actor,
    verb: row.verb,
    summary: row.summary,
    task_id: row.task_id ?? null,
    document_id: row.document_id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function createTaskForAgent(input: {
  agent: Agent;
  title: string;
  details: string | null;
  priority: Priority;
  actor: string;
}): Promise<Task> {
  const { data, error } = await db()
    .from("tasks")
    .insert({
      title: input.title,
      details: input.details,
      agent_id: input.agent.id,
      priority: input.priority,
      status: "todo",
      blocked: false,
      blocked_note: null,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = data as Task;
  const summary =
    input.actor === "tito"
      ? `added ${quote(task.title)} for ${input.agent.name}`
      : `added ${quote(task.title)}`;
  await writeActivity({
    actor: input.actor,
    verb: "created",
    task_id: task.id,
    summary,
  });
  return task;
}

export async function applyTaskPatch(
  taskId: string,
  patch: TaskPatch,
  actor: string,
): Promise<{ task: Task } | { error: string }> {
  const current = await getTask(taskId);
  if (!current) return { error: "Task not found" };

  let title = patch.title ?? current.title;
  const details = patch.details !== undefined ? patch.details : current.details;
  const priority = patch.priority ?? current.priority;
  const status = patch.status ?? current.status;
  let blocked = patch.blocked ?? current.blocked;
  let blockedNote = patch.blocked_note !== undefined ? patch.blocked_note : current.blocked_note;
  const agentId = patch.agent_id ?? current.agent_id;
  let doneAt = current.done_at;

  if (status === "done") {
    blocked = false;
    blockedNote = null;
    if (current.status !== "done" || !doneAt) doneAt = new Date().toISOString();
  } else if (current.status === "done") {
    doneAt = null;
  }

  if (!blocked) blockedNote = null;
  if (blocked && !blockedNote?.trim()) return { error: "A blocked task needs a note" };

  title = title.trim();
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title must be 200 characters or fewer" };
  if (details && details.length > 5000) return { error: "Details must be 5000 characters or fewer" };
  if (blockedNote && blockedNote.length > 1000) return { error: "Block note must be 1000 characters or fewer" };

  const agents = await listAgents();
  const nextAgent = agents.find((agent) => agent.id === agentId);
  if (!nextAgent) return { error: "Unknown agent" };

  const same =
    title === current.title &&
    (details ?? null) === (current.details ?? null) &&
    priority === current.priority &&
    status === current.status &&
    blocked === current.blocked &&
    (blockedNote ?? null) === (current.blocked_note ?? null) &&
    agentId === current.agent_id &&
    (doneAt ?? null) === (current.done_at ?? null);

  if (same) return { task: current };

  const { data, error } = await db()
    .from("tasks")
    .update({
      title,
      details,
      priority,
      status,
      blocked,
      blocked_note: blockedNote,
      agent_id: agentId,
      done_at: doneAt,
    })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = data as Task;

  const parts: { verb: string; text: string }[] = [];
  if (status !== current.status) {
    parts.push({ verb: "moved", text: `moved ${quote(title)} to ${statusLabel(status)}` });
  }
  if (blocked && !current.blocked) {
    parts.push({ verb: "blocked", text: `marked ${quote(title)} blocked` });
  } else if (!blocked && current.blocked && status !== "done") {
    parts.push({ verb: "unblocked", text: `cleared the block on ${quote(title)}` });
  }
  if (priority !== current.priority) {
    const text =
      priority === "high"
        ? `raised ${quote(title)} to High`
        : `set ${quote(title)} to ${priorityLabel(priority)}`;
    parts.push({ verb: "priority", text });
  }
  if (agentId !== current.agent_id) {
    parts.push({ verb: "reassigned", text: `reassigned ${quote(title)} to ${nextAgent.name}` });
  }
  if (!parts.length && (title !== current.title || (details ?? null) !== (current.details ?? null))) {
    parts.push({ verb: "updated", text: `updated ${quote(title)}` });
  }
  if (parts.length) {
    await writeActivity({
      actor,
      verb: parts.length === 1 ? parts[0].verb : "updated",
      task_id: task.id,
      summary: parts.map((part) => part.text).join("; "),
    });
  }
  return { task };
}

export async function upsertReport(input: {
  agent: Agent;
  reportDate: string;
  done: string[];
  inProgress: string[];
  blocked: string[];
}): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("reports")
    .upsert(
      {
        agent_id: input.agent.id,
        report_date: input.reportDate,
        done: input.done,
        in_progress: input.inProgress,
        blocked: input.blocked,
        posted_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,report_date" },
    )
    .select("id,agent_id,report_date,done,in_progress,blocked,posted_at")
    .single();
  if (error) throw new Error(error.message);
  await writeActivity({
    actor: input.agent.slug,
    verb: "posted_report",
    summary: "posted today’s report",
  });
  return {
    ...(data as Record<string, unknown>),
    agent: input.agent.slug,
  };
}

async function findDocumentByPath(vaultPath: string) {
  const { data, error } = await db()
    .from("documents")
    .select("id,title,vault_path,url,created_at,last_changed_at")
    .eq("vault_path", vaultPath)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    title: string;
    vault_path: string;
    url: string | null;
    created_at: string;
    last_changed_at: string;
  } | null;
}

export async function logDocumentEvent(input: {
  agent: Agent;
  title: string;
  vaultPath: string;
  fromPath?: string | null;
  url: string | null | undefined;
  action: DocAction;
  changeSummary: string;
}): Promise<{ document: Record<string, unknown>; event: Record<string, unknown> } | { error: string }> {
  const fromPath = input.fromPath?.trim() || null;
  let existing = await findDocumentByPath(input.action === "moved" && fromPath ? fromPath : input.vaultPath);

  if (input.action === "moved" && fromPath) {
    if (!existing) return { error: "No document at from_path" };
    if (fromPath !== input.vaultPath) {
      const collision = await findDocumentByPath(input.vaultPath);
      if (collision && collision.id !== existing.id) return { error: "A document already uses that vault path" };
    }
  }

  const now = new Date().toISOString();
  let documentId: string;
  if (existing) {
    const nextUrl = input.url === undefined ? existing.url : input.url;
    const { data, error } = await db()
      .from("documents")
      .update({
        title: input.title,
        vault_path: input.vaultPath,
        url: nextUrl,
        last_changed_at: now,
      })
      .eq("id", existing.id)
      .select("id,title,vault_path,url,created_at,last_changed_at")
      .single();
    if (error) throw new Error(error.message);
    documentId = (data as { id: string }).id;
    existing = data as typeof existing;
  } else {
    if (input.action === "moved") return { error: "No document at from_path" };
    const { data, error } = await db()
      .from("documents")
      .insert({
        title: input.title,
        vault_path: input.vaultPath,
        url: input.url ?? null,
        last_changed_at: now,
      })
      .select("id,title,vault_path,url,created_at,last_changed_at")
      .single();
    if (error) throw new Error(error.message);
    documentId = (data as { id: string }).id;
    existing = data as NonNullable<typeof existing>;
  }

  const { data: event, error: eventError } = await db()
    .from("document_events")
    .insert({
      document_id: documentId,
      agent_id: input.agent.id,
      action: input.action,
      change_summary: input.changeSummary,
    })
    .select("id,document_id,agent_id,action,change_summary,created_at")
    .single();
  if (eventError) throw new Error(eventError.message);

  await writeActivity({
    actor: input.agent.slug,
    verb: `document_${input.action}`,
    document_id: documentId,
    summary: `${input.action} ${quote(input.title)}`,
  });

  return {
    document: { ...(existing as Record<string, unknown>), agent: input.agent.slug },
    event: event as Record<string, unknown>,
  };
}

export async function agentById(id: string): Promise<Agent | null> {
  const agents = await listAgents();
  return agents.find((agent) => agent.id === id) ?? null;
}
