import "server-only";
import { db } from "@/lib/db";
import { getTask, listAgents } from "@/lib/data";
import { planDocumentMove } from "@/lib/documents";
import { statusActivitySummary } from "@/lib/live";
import { outreachActivitySummary, type OutreachPatch, type OutreachRow, type OutreachWrite } from "@/lib/outreach";
import type { Agent, DocAction, LiveState, Priority, Task, TaskStatus } from "@/lib/types";

const TASK_COLUMNS =
  "id,title,details,agent_id,priority,status,blocked,blocked_note,blocked_reason,unblock_needed,created_at,updated_at,done_at";

export type TaskPatch = {
  title?: string;
  details?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  blocked?: boolean;
  blocked_note?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
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

export async function recordHeartbeat(input: {
  agent: Agent;
  state: LiveState;
  workingOn: string;
  blockedReason?: string | null;
  unblockNeeded?: string | null;
}): Promise<{
  agent: string;
  state: LiveState;
  working_on: string;
  updated_at: string;
  blocked_reason: string | null;
  unblock_needed: string | null;
}> {
  const blocked = input.state === "blocked";
  const blockedReason = blocked ? input.blockedReason?.trim() || null : null;
  const unblockNeeded = blocked ? input.unblockNeeded?.trim() || null : null;
  const { data, error } = await db()
    .from("agent_heartbeats")
    .insert({
      agent_id: input.agent.id,
      state: input.state,
      working_on: input.workingOn,
      blocked_reason: blockedReason,
      unblock_needed: unblockNeeded,
    })
    .select("created_at")
    .single();
  if (error) throw new Error(error.message);
  const updatedAt = (data as { created_at: string }).created_at;

  await writeActivity({
    actor: input.agent.slug,
    verb: "status",
    summary: statusActivitySummary(input.state, input.workingOn),
  });

  const { error: statusError } = await db()
    .from("agent_status")
    .upsert(
      {
        agent_id: input.agent.id,
        state: input.state,
        working_on: input.workingOn,
        updated_at: updatedAt,
        blocked_reason: blockedReason,
        unblock_needed: unblockNeeded,
      },
      { onConflict: "agent_id" },
    );
  if (statusError) throw new Error(statusError.message);

  return {
    agent: input.agent.slug,
    state: input.state,
    working_on: input.workingOn,
    updated_at: updatedAt,
    blocked_reason: blockedReason,
    unblock_needed: unblockNeeded,
  };
}

export async function createTaskForAgent(input: {
  agent: Agent;
  title: string;
  details: string | null;
  priority: Priority;
  actor: string;
  blocked?: boolean;
  blockedNote?: string | null;
  blockedReason?: string | null;
  unblockNeeded?: string | null;
}): Promise<Task> {
  const blocked = Boolean(input.blocked);
  const blockedReason = blocked ? input.blockedReason?.trim() || null : null;
  const unblockNeeded = blocked ? input.unblockNeeded?.trim() || null : null;
  const blockedNote = blocked ? input.blockedNote?.trim() || blockedReason : null;
  const { data, error } = await db()
    .from("tasks")
    .insert({
      title: input.title,
      details: input.details,
      agent_id: input.agent.id,
      priority: input.priority,
      status: "todo",
      blocked,
      blocked_note: blockedNote,
      blocked_reason: blockedReason,
      unblock_needed: unblockNeeded,
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
  let blockedReason = patch.blocked_reason !== undefined ? patch.blocked_reason : (current.blocked_reason ?? null);
  let unblockNeeded = patch.unblock_needed !== undefined ? patch.unblock_needed : (current.unblock_needed ?? null);
  const agentId = patch.agent_id ?? current.agent_id;
  let doneAt = current.done_at;

  if (status === "done") {
    blocked = false;
    if (current.status !== "done" || !doneAt) doneAt = new Date().toISOString();
  } else if (current.status === "done") {
    doneAt = null;
  }

  blockedNote = blockedNote?.trim() || null;
  blockedReason = blockedReason?.trim() || null;
  unblockNeeded = unblockNeeded?.trim() || null;

  if (!blocked) {
    blockedNote = null;
    blockedReason = null;
    unblockNeeded = null;
  } else if (patch.blocked_reason !== undefined && patch.blocked_note === undefined && blockedReason) {
    blockedNote = blockedReason;
  } else if (!blockedNote && blockedReason) {
    blockedNote = blockedReason;
  }

  if (blocked && !blockedNote) return { error: "A blocked task needs a note" };

  title = title.trim();
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title must be 200 characters or fewer" };
  if (details && details.length > 5000) return { error: "Details must be 5000 characters or fewer" };
  if (blockedNote && blockedNote.length > 1000) return { error: "Block note must be 1000 characters or fewer" };
  if (blockedReason && blockedReason.length > 1000) return { error: "Block reason must be 1000 characters or fewer" };
  if (unblockNeeded && unblockNeeded.length > 1000) return { error: "Unblock note must be 1000 characters or fewer" };

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
    (blockedReason ?? null) === (current.blocked_reason ?? null) &&
    (unblockNeeded ?? null) === (current.unblock_needed ?? null) &&
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
      blocked_reason: blockedReason,
      unblock_needed: unblockNeeded,
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
  const blockTextChanged =
    (blockedNote ?? null) !== (current.blocked_note ?? null) ||
    (blockedReason ?? null) !== (current.blocked_reason ?? null) ||
    (unblockNeeded ?? null) !== (current.unblock_needed ?? null);
  if (
    status !== "done" &&
    blockTextChanged &&
    !parts.some((part) => part.verb === "blocked" || part.verb === "unblocked")
  ) {
    parts.push({ verb: "updated", text: `updated the block on ${quote(title)}` });
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

const DOCUMENT_COLUMNS = "id,title,vault_path,url,created_at,last_changed_at";
const EVENT_COLUMNS = "id,document_id,agent_id,action,change_summary,from_path,created_at";

async function saveDocument(
  existing: NonNullable<Awaited<ReturnType<typeof findDocumentByPath>>>,
  input: { title: string; vaultPath: string; url: string | null | undefined },
  now: string,
) {
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
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as NonNullable<Awaited<ReturnType<typeof findDocumentByPath>>>;
}

async function createDocument(
  input: { title: string; vaultPath: string; url: string | null | undefined },
  now: string,
) {
  const { data, error } = await db()
    .from("documents")
    .insert({
      title: input.title,
      vault_path: input.vaultPath,
      url: input.url ?? null,
      last_changed_at: now,
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as NonNullable<Awaited<ReturnType<typeof findDocumentByPath>>>;
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
  const now = new Date().toISOString();
  let existing: NonNullable<Awaited<ReturnType<typeof findDocumentByPath>>>;
  let eventFromPath: string | null = null;

  if (input.action === "moved") {
    const prior = fromPath ? await findDocumentByPath(fromPath) : null;
    const destination = fromPath === input.vaultPath ? prior : await findDocumentByPath(input.vaultPath);
    const plan = planDocumentMove({
      fromPath,
      vaultPath: input.vaultPath,
      prior,
      destination,
    });
    if (plan.action === "conflict") return { error: "A document already uses that vault path" };
    eventFromPath = plan.fromPath;
    if (plan.action === "update") {
      const current = prior?.id === plan.id ? prior : destination;
      if (!current) throw new Error("Document was not saved");
      existing = await saveDocument(current, input, now);
    } else {
      existing = await createDocument(input, now);
    }
  } else {
    const current = await findDocumentByPath(input.vaultPath);
    existing = current ? await saveDocument(current, input, now) : await createDocument(input, now);
  }

  const documentId = existing.id;

  const { data: event, error: eventError } = await db()
    .from("document_events")
    .insert({
      document_id: documentId,
      agent_id: input.agent.id,
      action: input.action,
      change_summary: input.changeSummary,
      from_path: eventFromPath,
    })
    .select(EVENT_COLUMNS)
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

const OUTREACH_COLUMNS =
  "id,agent_id,person_name,company,title,email,linkedin_url,channel,contacted_at,message,status,source_url,created_at,updated_at";

export async function createOutreach(input: { agent: Agent; value: OutreachWrite }): Promise<OutreachRow> {
  const { data, error } = await db()
    .from("outreach")
    .insert({
      agent_id: input.agent.id,
      person_name: input.value.personName,
      company: input.value.company,
      title: input.value.title,
      email: input.value.email,
      linkedin_url: input.value.linkedinUrl,
      channel: input.value.channel,
      contacted_at: input.value.contactedAt,
      message: input.value.message,
      status: input.value.status,
      source_url: input.value.sourceUrl,
    })
    .select(OUTREACH_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as OutreachRow;
  await writeActivity({
    actor: input.agent.slug,
    verb: "outreach_logged",
    summary: outreachActivitySummary("logged", row),
  });
  return row;
}

export async function updateOutreach(
  id: string,
  patch: OutreachPatch & { agentId?: string },
  actor: Agent,
  previousStatus: OutreachRow["status"],
): Promise<OutreachRow> {
  const changes: Record<string, string | null> = {};
  if (patch.personName !== undefined) changes.person_name = patch.personName;
  if (patch.company !== undefined) changes.company = patch.company;
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.email !== undefined) changes.email = patch.email;
  if (patch.linkedinUrl !== undefined) changes.linkedin_url = patch.linkedinUrl;
  if (patch.channel !== undefined) changes.channel = patch.channel;
  if (patch.contactedAt !== undefined) changes.contacted_at = patch.contactedAt;
  if (patch.message !== undefined) changes.message = patch.message;
  if (patch.status !== undefined) changes.status = patch.status;
  if (patch.sourceUrl !== undefined) changes.source_url = patch.sourceUrl;
  if (patch.agentId !== undefined) changes.agent_id = patch.agentId;

  const { data, error } = await db().from("outreach").update(changes).eq("id", id).select(OUTREACH_COLUMNS).single();
  if (error) throw new Error(error.message);
  const row = data as OutreachRow;
  await writeActivity({
    actor: actor.slug,
    verb: "outreach_updated",
    summary: outreachActivitySummary("updated", row, previousStatus),
  });
  return row;
}

export async function agentById(id: string): Promise<Agent | null> {
  const agents = await listAgents();
  return agents.find((agent) => agent.id === id) ?? null;
}
