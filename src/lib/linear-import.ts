import {
  inferLinkKind,
  parseAssignee,
  parsePriority,
  parseStatus,
  slugify,
  type CanonicalPriority,
  type CanonicalStatus,
} from "@/lib/work";
import type { LinkKind } from "@/lib/types";
import { isHttpUrl } from "@/lib/url";

export type LinearDraft = {
  index: number;
  linearId: string;
  title: string;
  details: string | null;
  status: CanonicalStatus;
  priority: CanonicalPriority;
  labels: string[];
  projectName: string | null;
  assigneeName: string | null;
  dueOn: string | null;
  url: string | null;
  parentLinearId: string | null;
  ownerSlug: string | null;
};

export type ImportTask = {
  id: string;
  identifier: string | null;
  linearId: string;
  title: string;
  details: string | null;
  status: CanonicalStatus;
  priority: CanonicalPriority;
  agentId: string;
  projectId: string | null;
  assigneeHerzen: boolean;
  assigneeAgentId: string | null;
  dueOn: string | null;
  parentId: string | null;
  url: string | null;
  labels: string[];
  externalRefs: Record<string, string>;
};

export type LinearWrite = Omit<ImportTask, "id" | "identifier">;

export type LinearStore = {
  findByLinearId(linearId: string): Promise<ImportTask | null>;
  insert(row: LinearWrite): Promise<ImportTask>;
  update(id: string, row: LinearWrite): Promise<ImportTask>;
  ensureProject(name: string): Promise<{ id: string; name: string }>;
  setLabels(taskId: string, names: string[]): Promise<void>;
  ensureLink(taskId: string, url: string, kind: LinkKind): Promise<void>;
};

export type AgentRef = { id: string; slug: string; name: string };

export type ImportIssueError = { index: number; identifier: string | null; error: string };

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  tasks: { id: string; identifier: string | null; linear_id: string; action: "created" | "updated" | "unchanged" }[];
  errors: ImportIssueError[];
};

const STATE_NAMES: Record<string, CanonicalStatus> = {
  backlog: "backlog",
  "to do": "todo",
  todo: "todo",
  unstarted: "todo",
  "in progress": "in_progress",
  in_progress: "in_progress",
  doing: "in_progress",
  started: "in_progress",
  "in review": "in_review",
  in_review: "in_review",
  review: "in_review",
  done: "done",
  completed: "done",
  complete: "done",
  canceled: "canceled",
  cancelled: "canceled",
};

const STATE_TYPES: Record<string, CanonicalStatus> = {
  backlog: "backlog",
  unstarted: "todo",
  started: "in_progress",
  completed: "done",
  canceled: "canceled",
  cancelled: "canceled",
};

const PRIORITY_NUMBERS: Record<number, CanonicalPriority> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function linearState(value: unknown): CanonicalStatus | { error: string } {
  if (value === undefined || value === null || value === "") return "todo";
  if (typeof value === "string") {
    const parsed = parseStatus(value);
    if (parsed.ok) return parsed.status;
    const named = STATE_NAMES[fold(value)];
    if (named) return named;
    return { error: `Unknown state "${value}"` };
  }
  const record = asRecord(value);
  if (!record) return { error: "Unknown state" };
  if (typeof record.name === "string") {
    const parsed = parseStatus(record.name);
    if (parsed.ok) return parsed.status;
    const named = STATE_NAMES[fold(record.name)];
    if (named) return named;
  }
  if (typeof record.type === "string") {
    const typed = STATE_TYPES[fold(record.type)];
    if (typed) return typed;
  }
  return { error: "Unknown state" };
}

function linearPriority(value: unknown): CanonicalPriority | { error: string } {
  if (value === undefined || value === null || value === "") return "none";
  if (typeof value === "number" && Number.isInteger(value) && value in PRIORITY_NUMBERS) return PRIORITY_NUMBERS[value];
  if (typeof value === "string") {
    const numbered = Number(value);
    if (value.trim() !== "" && Number.isInteger(numbered) && numbered in PRIORITY_NUMBERS) return PRIORITY_NUMBERS[numbered];
    const parsed = parsePriority(value);
    if (parsed.ok) return parsed.priority;
    if (fold(value) === "no priority") return "none";
    return { error: `Unknown priority "${value}"` };
  }
  const record = asRecord(value);
  if (!record) return { error: "Unknown priority" };
  if (typeof record.value === "number" && record.value in PRIORITY_NUMBERS) return PRIORITY_NUMBERS[record.value];
  if (typeof record.name === "string") return linearPriority(record.name);
  return { error: "Unknown priority" };
}

function linearText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.name === "string") return record.name.trim() || null;
  if (typeof record.identifier === "string") return record.identifier.trim() || null;
  return null;
}

function dueDate(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return { error: "due date must be YYYY-MM-DD" };
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "due date must be YYYY-MM-DD" };
  return date;
}

export function parseLinearIssue(value: unknown, index: number): { ok: true; draft: LinearDraft } | { ok: false; error: string } {
  const record = asRecord(value);
  if (!record) return { ok: false, error: "Each issue must be an object" };
  const identifier = linearText(pick(record, ["identifier", "linear_id", "id"]));
  if (!identifier) return { ok: false, error: "identifier is required" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(identifier)) {
    return { ok: false, error: "identifier must be a short token such as ENG-123" };
  }
  const title = linearText(pick(record, ["title"]));
  if (!title) return { ok: false, error: "title is required" };
  if (title.length > 200) return { ok: false, error: "title must be 200 characters or fewer" };
  const description = pick(record, ["description", "details"]);
  const details = typeof description === "string" ? description.trim() || null : null;
  if (details && details.length > 20000) return { ok: false, error: "description must be 20000 characters or fewer" };
  const status = linearState(pick(record, ["state", "status"]));
  if (typeof status === "object") return { ok: false, error: status.error };
  const priority = linearPriority(pick(record, ["priority"]));
  if (typeof priority === "object") return { ok: false, error: priority.error };
  const labelsRaw = pick(record, ["labels"]);
  const labels: string[] = [];
  if (labelsRaw !== undefined) {
    if (!Array.isArray(labelsRaw)) return { ok: false, error: "labels must be an array" };
    for (const item of labelsRaw) {
      const name = linearText(item);
      if (!name) return { ok: false, error: "labels must be names" };
      if (name.length > 40) return { ok: false, error: "label names must be 40 characters or fewer" };
      if (!labels.some((label) => label.toLowerCase() === name.toLowerCase())) labels.push(name);
    }
  }
  const projectName = linearText(pick(record, ["project"]));
  const assigneeName = linearText(pick(record, ["assignee"]));
  const due = dueDate(pick(record, ["dueDate", "due_date", "due date", "due_on"]));
  if (due && typeof due === "object") return { ok: false, error: due.error };
  const urlRaw = pick(record, ["url", "linear_url"]);
  let url: string | null = null;
  if (typeof urlRaw === "string" && urlRaw.trim()) {
    if (!isHttpUrl(urlRaw.trim())) return { ok: false, error: "url must be http or https" };
    url = urlRaw.trim();
  }
  const parentLinearId = linearText(pick(record, ["parent", "parentIdentifier", "parent_identifier"]));
  const owner = linearText(pick(record, ["agent", "owner"]));
  return {
    ok: true,
    draft: {
      index,
      linearId: identifier,
      title,
      details,
      status,
      priority,
      labels,
      projectName,
      assigneeName,
      dueOn: due,
      url,
      parentLinearId,
      ownerSlug: owner ? owner.toLowerCase() : null,
    },
  };
}

export function parseLinearBatch(
  body: unknown,
): { ok: true; drafts: LinearDraft[]; errors: ImportIssueError[] } | { ok: false; error: string } {
  const list = Array.isArray(body) ? body : asRecord(body) && Array.isArray(asRecord(body)?.issues) ? (asRecord(body)?.issues as unknown[]) : null;
  if (!list) return { ok: false, error: "Expected a JSON array of issues" };
  if (list.length > 2000) return { ok: false, error: "Import at most 2000 issues at a time" };
  const drafts: LinearDraft[] = [];
  const errors: ImportIssueError[] = [];
  list.forEach((item, index) => {
    const parsed = parseLinearIssue(item, index);
    if (!parsed.ok) {
      const identifier = asRecord(item) ? linearText(pick(asRecord(item) as Record<string, unknown>, ["identifier"])) : null;
      errors.push({ index, identifier, error: parsed.error });
      return;
    }
    drafts.push(parsed.draft);
  });
  return { ok: true, drafts, errors };
}

function matchAgent(name: string, agents: AgentRef[]): AgentRef | null {
  const folded = name.trim().toLowerCase();
  const slug = slugify(name);
  return (
    agents.find((agent) => agent.slug === folded || agent.slug === slug || agent.name.toLowerCase() === folded) ?? null
  );
}

function sameTask(current: ImportTask, next: LinearWrite): boolean {
  return (
    current.title === next.title &&
    (current.details ?? null) === (next.details ?? null) &&
    current.status === next.status &&
    current.priority === next.priority &&
    current.agentId === next.agentId &&
    (current.projectId ?? null) === (next.projectId ?? null) &&
    current.assigneeHerzen === next.assigneeHerzen &&
    (current.assigneeAgentId ?? null) === (next.assigneeAgentId ?? null) &&
    (current.dueOn ?? null) === (next.dueOn ?? null) &&
    (current.url ?? null) === (next.url ?? null) &&
    current.labels.join("\n") === next.labels.join("\n") &&
    (current.externalRefs.linear_url ?? null) === (next.externalRefs.linear_url ?? null) &&
    current.externalRefs.linear_id === next.externalRefs.linear_id
  );
}

export async function runLinearImport(
  body: unknown,
  store: LinearStore,
  agents: AgentRef[],
  fallbackOwnerId: string,
): Promise<ImportResult> {
  const parsed = parseLinearBatch(body);
  if (!parsed.ok) return { created: 0, updated: 0, unchanged: 0, tasks: [], errors: [{ index: -1, identifier: null, error: parsed.error }] };
  const errors = [...parsed.errors];
  const tasks: ImportResult["tasks"] = [];
  const idByLinear = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const draft of parsed.drafts) {
    const existing = await store.findByLinearId(draft.linearId);
    const owner =
      (draft.ownerSlug && matchAgent(draft.ownerSlug, agents)?.id) ||
      (draft.assigneeName && matchAgent(draft.assigneeName, agents)?.id) ||
      existing?.agentId ||
      fallbackOwnerId;
    const assignee = draft.assigneeName ? parseAssignee(draft.assigneeName) : { ok: true as const, assignee: null };
    const assigneeName = assignee.ok ? assignee.assignee : null;
    const assigneeAgent = assigneeName && assigneeName !== "herzen" ? matchAgent(assigneeName, agents) : null;
    const project = draft.projectName ? await store.ensureProject(draft.projectName) : null;
    const externalRefs: Record<string, string> = {
      ...(existing?.externalRefs ?? {}),
      linear_id: draft.linearId,
    };
    if (draft.url) externalRefs.linear_url = draft.url;
    const next: LinearWrite = {
      linearId: draft.linearId,
      title: draft.title,
      details: draft.details,
      status: draft.status,
      priority: draft.priority,
      agentId: owner,
      projectId: project?.id ?? null,
      assigneeHerzen: assigneeName === "herzen",
      assigneeAgentId: assigneeAgent?.id ?? null,
      dueOn: draft.dueOn,
      parentId: existing?.parentId ?? null,
      url: draft.url,
      labels: draft.labels,
      externalRefs,
    };
    let task: ImportTask;
    let action: "created" | "updated" | "unchanged";
    if (!existing) {
      task = await store.insert(next);
      action = "created";
      created += 1;
    } else if (sameTask(existing, next)) {
      task = existing;
      action = "unchanged";
      unchanged += 1;
    } else {
      task = await store.update(existing.id, next);
      action = "updated";
      updated += 1;
    }
    if (action !== "unchanged") await store.setLabels(task.id, draft.labels);
    else if (existing && existing.labels.join("\n") !== draft.labels.join("\n")) await store.setLabels(task.id, draft.labels);
    if (draft.url) await store.ensureLink(task.id, draft.url, inferLinkKind(draft.url));
    idByLinear.set(draft.linearId, task.id);
    tasks.push({ id: task.id, identifier: task.identifier, linear_id: draft.linearId, action });
  }

  for (const draft of parsed.drafts) {
    if (!draft.parentLinearId) continue;
    const taskId = idByLinear.get(draft.linearId);
    if (!taskId) continue;
    const parentId = idByLinear.get(draft.parentLinearId) ?? (await store.findByLinearId(draft.parentLinearId))?.id ?? null;
    if (!parentId) {
      errors.push({ index: draft.index, identifier: draft.linearId, error: `Parent ${draft.parentLinearId} was not found` });
      continue;
    }
    if (parentId === taskId) {
      errors.push({ index: draft.index, identifier: draft.linearId, error: "A task cannot be its own parent" });
      continue;
    }
    const current = await store.findByLinearId(draft.linearId);
    if (current && current.parentId !== parentId) {
      await store.update(taskId, { ...current, parentId, linearId: draft.linearId });
      const listed = tasks.find((item) => item.linear_id === draft.linearId);
      if (listed?.action === "unchanged") {
        listed.action = "updated";
        unchanged -= 1;
        updated += 1;
      }
    }
  }

  return { created, updated, unchanged, tasks, errors };
}
