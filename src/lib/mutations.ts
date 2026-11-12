import "server-only";
import { db } from "@/lib/db";
import { getTask, listAgents } from "@/lib/data";
import { planDocumentMove } from "@/lib/documents";
import { statusActivitySummary } from "@/lib/live";
import { outreachActivitySummary, type OutreachPatch, type OutreachRow, type OutreachWrite } from "@/lib/outreach";
import type { Agent, DocAction, ExternalRefs, LinkKind, LiveState, Priority, ReportBlockedItem, Task } from "@/lib/types";
import {
  parentCreatesCycle,
  planTaskUpdate,
  TASK_COLUMNS,
  type CanonicalPriority,
  type CanonicalStatus,
  type TaskPatch,
} from "@/lib/work";
import { ensureTaskLink, insertBlockEvent, listParentMap, setTaskLabels } from "@/lib/work-db";

export type { TaskPatch };

function quote(title: string): string {
  return `“${title}”`;
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
  waitingOn?: string | null;
  sourceUrl?: string | null;
}): Promise<{
  agent: string;
  state: LiveState;
  working_on: string;
  updated_at: string;
  blocked_reason: string | null;
  unblock_needed: string | null;
  waiting_on: string | null;
  source_url: string | null;
}> {
  const blocked = input.state === "blocked";
  const blockedReason = blocked ? input.blockedReason?.trim() || null : null;
  const waitingOn = blocked ? input.waitingOn?.trim() || null : null;
  const sourceUrl = blocked ? input.sourceUrl?.trim() || null : null;
  const unblockNeeded = blocked ? input.unblockNeeded?.trim() || waitingOn : null;
  const { data, error } = await db()
    .from("agent_heartbeats")
    .insert({
      agent_id: input.agent.id,
      state: input.state,
      working_on: input.workingOn,
      blocked_reason: blockedReason,
      unblock_needed: unblockNeeded,
      waiting_on: waitingOn,
      source_url: sourceUrl,
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
        waiting_on: waitingOn,
        source_url: sourceUrl,
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
    waiting_on: waitingOn,
    source_url: sourceUrl,
  };
}

export async function createTaskForAgent(input: {
  agent: Agent;
  title: string;
  details: string | null;
  priority: Priority | CanonicalPriority;
  actor: string;
  status?: CanonicalStatus;
  blocked?: boolean;
  blockedNote?: string | null;
  blockedReason?: string | null;
  unblockNeeded?: string | null;
  waitingOn?: string | null;
  sourceUrl?: string | null;
  projectId?: string | null;
  assigneeAgentId?: string | null;
  assigneeHerzen?: boolean;
  dueOn?: string | null;
  parentId?: string | null;
  externalRefs?: ExternalRefs;
  labels?: string[];
  links?: { kind?: LinkKind; url: string; label?: string | null }[];
}): Promise<Task> {
  const blocked = Boolean(input.blocked);
  const blockedReason = blocked ? input.blockedReason?.trim() || null : null;
  const waitingOn = blocked ? input.waitingOn?.trim() || null : null;
  const sourceUrl = blocked ? input.sourceUrl?.trim() || null : null;
  const unblockNeeded = blocked ? input.unblockNeeded?.trim() || waitingOn : null;
  const blockedNote = blocked ? input.blockedNote?.trim() || blockedReason : null;
  const status = input.status ?? "todo";
  const { data, error } = await db()
    .from("tasks")
    .insert({
      title: input.title,
      details: input.details,
      agent_id: input.agent.id,
      priority: input.priority === "normal" ? "medium" : input.priority,
      status,
      blocked,
      blocked_note: blockedNote,
      blocked_reason: blockedReason,
      unblock_needed: unblockNeeded,
      waiting_on: waitingOn,
      source_url: sourceUrl,
      project_id: input.projectId ?? null,
      assignee_agent_id: input.assigneeHerzen ? null : (input.assigneeAgentId ?? null),
      assignee_herzen: Boolean(input.assigneeHerzen),
      due_on: input.dueOn ?? null,
      parent_id: input.parentId ?? null,
      external_refs: input.externalRefs ?? {},
      done_at: status === "done" ? new Date().toISOString() : null,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = data as Task;
  const actorName = input.actor === "tito" || input.actor === "herzen";
  const summary = actorName ? `added ${quote(task.title)} for ${input.agent.name}` : `added ${quote(task.title)}`;
  await writeActivity({
    actor: input.actor,
    verb: "created",
    task_id: task.id,
    summary,
  });
  if (blocked) {
    await insertBlockEvent({
      taskId: task.id,
      actor: input.actor,
      action: "blocked",
      snapshot: {
        blocked_note: blockedNote,
        blocked_reason: blockedReason,
        unblock_needed: unblockNeeded,
        waiting_on: waitingOn,
        source_url: sourceUrl,
      },
    });
  }
  if (input.labels?.length) await setTaskLabels(task.id, input.labels);
  const links = [...(input.links ?? [])];
  if (input.sourceUrl && !links.some((link) => link.url === input.sourceUrl)) {
    links.push({ url: input.sourceUrl, label: null });
  }
  for (const link of links) {
    await ensureTaskLink({
      taskId: task.id,
      url: link.url,
      kind: link.kind,
      label: link.label,
      createdBy: input.actor,
    });
  }
  return task;
}

export async function applyTaskPatch(
  taskId: string,
  patch: TaskPatch,
  actor: string,
): Promise<{ task: Task } | { error: string }> {
  const current = await getTask(taskId);
  if (!current) return { error: "Task not found" };

  const agents = await listAgents();
  const agentId = patch.agent_id ?? current.agent_id;
  const nextAgent = agents.find((agent) => agent.id === agentId);
  if (!nextAgent) return { error: "Unknown agent" };
  const parentMap = patch.parent_id ? await listParentMap() : null;
  const assignee = patch.assignee_herzen
    ? "Herzen"
    : agents.find((agent) => agent.id === patch.assignee_agent_id)?.name ?? null;
  const previousAssignee = current.assignee_herzen
    ? "Herzen"
    : agents.find((agent) => agent.id === current.assignee_agent_id)?.name ?? null;
  const planned = planTaskUpdate(current, patch, {
    now: new Date().toISOString(),
    nextAgentName: nextAgent.name,
    nextAssigneeLabel: assignee,
    previousAssigneeLabel: previousAssignee,
    parentCycles: parentMap ? parentCreatesCycle(taskId, patch.parent_id ?? null, parentMap) : false,
  });
  if ("error" in planned) return planned;
  if (planned.promoteLink) {
    await ensureTaskLink({
      taskId,
      url: planned.promoteLink.url,
      kind: planned.promoteLink.kind,
      label: planned.promoteLink.label,
      createdBy: actor,
    });
  }
  if (planned.unchanged) return { task: current };
  if (planned.blockEvent) {
    await insertBlockEvent({
      taskId,
      actor,
      action: planned.blockEvent.action,
      snapshot: planned.blockEvent.snapshot,
    });
  }

  const row = planned.row;
  const { data, error } = await db()
    .from("tasks")
    .update({
      title: row.title,
      details: row.details,
      priority: row.priority,
      status: row.status,
      blocked: row.blocked,
      blocked_note: row.blocked_note,
      blocked_reason: row.blocked_reason,
      unblock_needed: row.unblock_needed,
      waiting_on: row.waiting_on,
      source_url: row.source_url,
      agent_id: row.agent_id,
      project_id: row.project_id,
      assignee_agent_id: row.assignee_agent_id,
      assignee_herzen: row.assignee_herzen,
      due_on: row.due_on,
      parent_id: row.parent_id,
      external_refs: row.external_refs,
      done_at: row.done_at,
    })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = data as Task;
  if (planned.activity) {
    await writeActivity({
      actor,
      verb: planned.activity.verb,
      task_id: task.id,
      summary: planned.activity.summary,
    });
  }
  return { task };
}

export async function upsertReport(input: {
  agent: Agent;
  reportDate: string;
  done: string[];
  inProgress: string[];
  blocked: ReportBlockedItem[];
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
