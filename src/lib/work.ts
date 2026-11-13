import { isIsoDate } from "@/lib/time";
import type {
  BlockEvent,
  ExternalRefs,
  LinkKind,
  Priority,
  Project,
  Task,
  TaskComment,
  TaskLink,
  TaskStatus,
} from "@/lib/types";
import { isHttpUrl, isUuid } from "@/lib/url";

export type CanonicalStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "canceled";
export type CanonicalPriority = "none" | "low" | "medium" | "high" | "urgent";

export const TASK_COLUMNS =
  "id,title,details,agent_id,priority,status,blocked,blocked_note,blocked_reason,unblock_needed,waiting_on,source_url,created_at,updated_at,done_at,number,identifier,project_id,assignee_agent_id,assignee_herzen,due_on,parent_id,external_refs,resolution_state,resolution_pending,latest_resolution_at,resolution_acknowledged_at";

export const WORK_COLUMNS: { status: CanonicalStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
  { status: "canceled", label: "Canceled" },
];

export const PRIORITY_OPTIONS: { value: CanonicalPriority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const LINK_KINDS: LinkKind[] = ["pr", "issue", "doc", "deploy", "other"];

const STATUS_ERROR =
  "Status must be backlog, todo, in_progress, in_review, done, or canceled. doing is accepted as in_progress.";
const PRIORITY_ERROR =
  "Priority must be none, low, medium, high, or urgent. normal is accepted as medium.";

const STATUS_INPUT: Record<string, CanonicalStatus> = {
  backlog: "backlog",
  todo: "todo",
  doing: "in_progress",
  in_progress: "in_progress",
  "in progress": "in_progress",
  in_review: "in_review",
  "in review": "in_review",
  done: "done",
  canceled: "canceled",
  cancelled: "canceled",
};

const PRIORITY_INPUT: Record<string, CanonicalPriority> = {
  none: "none",
  low: "low",
  medium: "medium",
  normal: "medium",
  high: "high",
  urgent: "urgent",
};

const REF_KEY = /^[a-z][a-z0-9_]{0,40}$/;
const CLOUD_AGENT_ID = /^bc-[A-Za-z0-9][A-Za-z0-9_-]{1,80}$/;
const IDENTIFIER = /^hq-(\d+)$/i;

export function parseStatus(value: unknown): { ok: true; status: CanonicalStatus } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: STATUS_ERROR };
  const status = STATUS_INPUT[value.trim().toLowerCase()];
  if (!status) return { ok: false, error: STATUS_ERROR };
  return { ok: true, status };
}

export function parsePriority(
  value: unknown,
): { ok: true; priority: CanonicalPriority } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: PRIORITY_ERROR };
  const priority = PRIORITY_INPUT[value.trim().toLowerCase()];
  if (!priority) return { ok: false, error: PRIORITY_ERROR };
  return { ok: true, priority };
}

export function canonicalStatus(value: string): CanonicalStatus {
  return STATUS_INPUT[value.trim().toLowerCase()] ?? "todo";
}

export function canonicalPriority(value: string): CanonicalPriority {
  return PRIORITY_INPUT[value.trim().toLowerCase()] ?? "medium";
}

export function columnStatus(status: string): CanonicalStatus {
  return canonicalStatus(status);
}

export function isInProgressStatus(status: string): boolean {
  return canonicalStatus(status) === "in_progress";
}

export function isClosedStatus(status: string): boolean {
  const canonical = canonicalStatus(status);
  return canonical === "done" || canonical === "canceled";
}

export function statusLabel(status: string): string {
  return WORK_COLUMNS.find((column) => column.status === canonicalStatus(status))?.label ?? "To do";
}

export function priorityLabel(priority: string): string {
  return PRIORITY_OPTIONS.find((option) => option.value === canonicalPriority(priority))?.label ?? "Medium";
}

export function priorityRank(priority: string): number {
  const order: CanonicalPriority[] = ["urgent", "high", "medium", "low", "none"];
  const index = order.indexOf(canonicalPriority(priority));
  return index === -1 ? order.length : index;
}

export function formatIdentifier(number: number): string {
  return `HQ-${number}`;
}

export function parseIdentifier(value: string): number | null {
  const match = IDENTIFIER.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

export function inferLinkKind(url: string): LinkKind {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    if (path.includes("/pull/") || path.includes("/pulls/")) return "pr";
    if (host.includes("linear.app") || path.includes("/issues/") || path.includes("/issue/")) return "issue";
    if (host.endsWith(".vercel.app") || path.includes("/deploy")) return "deploy";
    if (host.startsWith("docs.") || host.includes("notion.") || path.endsWith(".md")) return "doc";
    return "other";
  } catch {
    return "other";
  }
}

export function personName(actor: string, agents: { slug: string; name: string }[]): string {
  if (actor === "herzen" || actor === "tito") return "Herzen";
  return agents.find((agent) => agent.slug === actor || agent.name === actor)?.name ?? actor;
}

/** Rows the migration rewrites. Legacy values stay valid in the check constraint. */
export function migrateLegacyTask<T extends { status: string; priority: string }>(row: T): T {
  return {
    ...row,
    status: row.status === "doing" ? "in_progress" : row.status,
    priority: row.priority === "normal" ? "medium" : row.priority,
  };
}

/** Stable HQ numbers in the same order as the migration: created_at, then id. */
export function assignIdentifiers<T extends { id: string; created_at: string }>(
  rows: T[],
): (T & { number: number; identifier: string })[] {
  const ordered = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  return ordered.map((row, index) => ({
    ...row,
    number: index + 1,
    identifier: formatIdentifier(index + 1),
  }));
}

export type BlockSnapshot = {
  blocked_note: string | null;
  blocked_reason: string | null;
  unblock_needed: string | null;
  waiting_on: string | null;
  source_url: string | null;
};

export function blockSnapshot(task: {
  blocked_note?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
  source_url?: string | null;
}): BlockSnapshot {
  return {
    blocked_note: task.blocked_note?.trim() || null,
    blocked_reason: task.blocked_reason?.trim() || null,
    unblock_needed: task.unblock_needed?.trim() || null,
    waiting_on: task.waiting_on?.trim() || null,
    source_url: task.source_url?.trim() || null,
  };
}

function quote(title: string): string {
  return `“${title}”`;
}

export type TaskPatch = {
  title?: string;
  details?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  blocked?: boolean;
  blocked_note?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
  source_url?: string | null;
  agent_id?: string;
  project_id?: string | null;
  assignee_agent_id?: string | null;
  assignee_herzen?: boolean;
  due_on?: string | null;
  parent_id?: string | null;
  external_refs?: Record<string, string | null>;
};

export type PlannedTask = {
  title: string;
  details: string | null;
  priority: CanonicalPriority;
  status: CanonicalStatus;
  blocked: boolean;
  blocked_note: string | null;
  blocked_reason: string | null;
  unblock_needed: string | null;
  waiting_on: string | null;
  source_url: string | null;
  agent_id: string;
  project_id: string | null;
  assignee_agent_id: string | null;
  assignee_herzen: boolean;
  due_on: string | null;
  parent_id: string | null;
  external_refs: ExternalRefs;
  done_at: string | null;
};

export type PlanContext = {
  now: string;
  nextAgentName: string;
  previousProjectName?: string | null;
  nextProjectName?: string | null;
  previousAssigneeLabel?: string | null;
  nextAssigneeLabel?: string | null;
  previousParentLabel?: string | null;
  nextParentLabel?: string | null;
  parentCycles?: boolean;
};

export type TaskPlan = {
  row: PlannedTask;
  activity: { verb: string; summary: string } | null;
  blockEvent: { action: "blocked" | "updated" | "cleared"; snapshot: BlockSnapshot } | null;
  promoteLink: { url: string; kind: LinkKind; label: string | null } | null;
  unchanged: boolean;
};

function refsOf(value: ExternalRefs | null | undefined): ExternalRefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const refs: ExternalRefs = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) refs[key] = entry.trim();
  }
  return refs;
}

export function mergeExternalRefs(
  current: ExternalRefs | null | undefined,
  patch: Record<string, string | null>,
): { ok: true; refs: ExternalRefs } | { ok: false; error: string } {
  const next = refsOf(current);
  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = rawKey.trim().toLowerCase();
    if (!REF_KEY.test(key)) return { ok: false, error: "external ref keys must be short lowercase words" };
    if (rawValue === null || rawValue === "") {
      delete next[key];
      continue;
    }
    if (typeof rawValue !== "string") return { ok: false, error: `${key} must be a string` };
    const value = rawValue.trim();
    if (!value) {
      delete next[key];
      continue;
    }
    if (value.length > 500) return { ok: false, error: `${key} must be 500 characters or fewer` };
    if (key === "linear_url" && !isHttpUrl(value)) return { ok: false, error: "linear_url must be http or https" };
    if (key === "cloud_agent_id" && !CLOUD_AGENT_ID.test(value)) {
      return { ok: false, error: "cloud_agent_id must look like bc-..." };
    }
    if (key === "linear_id" && /\s/.test(value)) return { ok: false, error: "linear_id cannot contain spaces" };
    next[key] = value;
  }
  return { ok: true, refs: next };
}

export function planTaskUpdate(current: Task, patch: TaskPatch, ctx: PlanContext): TaskPlan | { error: string } {
  const statusResult = parseStatus(patch.status ?? current.status);
  if (!statusResult.ok) return statusResult;
  const priorityResult = parsePriority(patch.priority ?? current.priority);
  if (!priorityResult.ok) return priorityResult;

  let title = patch.title ?? current.title;
  const details = patch.details !== undefined ? patch.details : current.details;
  const priority = priorityResult.priority;
  const status = statusResult.status;
  let blocked = patch.blocked ?? current.blocked;
  let blockedNote = patch.blocked_note !== undefined ? patch.blocked_note : current.blocked_note;
  let blockedReason = patch.blocked_reason !== undefined ? patch.blocked_reason : (current.blocked_reason ?? null);
  let unblockNeeded = patch.unblock_needed !== undefined ? patch.unblock_needed : (current.unblock_needed ?? null);
  let waitingOn = patch.waiting_on !== undefined ? patch.waiting_on : (current.waiting_on ?? null);
  let sourceUrl = patch.source_url !== undefined ? patch.source_url : (current.source_url ?? null);
  const agentId = patch.agent_id ?? current.agent_id;
  const projectId = patch.project_id !== undefined ? patch.project_id : (current.project_id ?? null);
  let assigneeAgentId =
    patch.assignee_agent_id !== undefined ? patch.assignee_agent_id : (current.assignee_agent_id ?? null);
  let assigneeHerzen = patch.assignee_herzen ?? Boolean(current.assignee_herzen);
  const dueOn = patch.due_on !== undefined ? patch.due_on : (current.due_on ?? null);
  const parentId = patch.parent_id !== undefined ? patch.parent_id : (current.parent_id ?? null);
  let doneAt = current.done_at;

  if (patch.assignee_herzen === true) assigneeAgentId = null;
  if (assigneeAgentId) assigneeHerzen = false;

  const closes = status === "done" || status === "canceled";
  if (closes) {
    blocked = false;
    if (status === "done" && (canonicalStatus(current.status) !== "done" || !doneAt)) doneAt = ctx.now;
  } else if (canonicalStatus(current.status) === "done") {
    doneAt = null;
  }
  if (status !== "done") {
    if (canonicalStatus(current.status) === "done") doneAt = null;
  }

  blockedNote = blockedNote?.trim() || null;
  blockedReason = blockedReason?.trim() || null;
  unblockNeeded = unblockNeeded?.trim() || null;
  waitingOn = waitingOn?.trim() || null;
  sourceUrl = sourceUrl?.trim() || null;
  const urlToKeep = sourceUrl;

  if (!blocked) {
    blockedNote = null;
    blockedReason = null;
    unblockNeeded = null;
    waitingOn = null;
    sourceUrl = null;
  } else if (patch.blocked_reason !== undefined && patch.blocked_note === undefined && blockedReason) {
    blockedNote = blockedReason;
  } else if (!blockedNote && blockedReason) {
    blockedNote = blockedReason;
  }
  if (blocked && !unblockNeeded && waitingOn) unblockNeeded = waitingOn;
  if (blocked && !blockedNote) return { error: "A blocked task needs a note" };

  title = title.trim();
  if (!title) return { error: "Title is required" };
  if (title.length > 200) return { error: "Title must be 200 characters or fewer" };
  if (details && details.length > 20000) return { error: "Details must be 20000 characters or fewer" };
  if (blockedNote && blockedNote.length > 1000) return { error: "Block note must be 1000 characters or fewer" };
  if (blockedReason && blockedReason.length > 1000) return { error: "Block reason must be 1000 characters or fewer" };
  if (unblockNeeded && unblockNeeded.length > 1000) return { error: "Unblock note must be 1000 characters or fewer" };
  if (waitingOn && waitingOn.length > 1000) return { error: "waiting_on must be 1000 characters or fewer" };
  if (urlToKeep) {
    if (urlToKeep.length > 1000) return { error: "source_url must be 1000 characters or fewer" };
    if (!isHttpUrl(urlToKeep)) return { error: "source_url must be http or https" };
  }
  if (dueOn && !isIsoDate(dueOn)) return { error: "due_on must be YYYY-MM-DD" };
  if (parentId && !isUuid(parentId)) return { error: "parent_id must be a task id" };
  if (parentId && parentId === current.id) return { error: "A task cannot be its own parent" };
  if (parentId && ctx.parentCycles) return { error: "A task cannot be nested under itself" };
  if (projectId && !isUuid(projectId)) return { error: "project_id must be a project id" };
  if (assigneeAgentId && !isUuid(assigneeAgentId)) return { error: "assignee must be an agent" };

  const merged = patch.external_refs
    ? mergeExternalRefs(current.external_refs, patch.external_refs)
    : { ok: true as const, refs: refsOf(current.external_refs) };
  if (!merged.ok) return merged;

  const row: PlannedTask = {
    title,
    details: details?.trim() ? details.trim() : null,
    priority,
    status,
    blocked,
    blocked_note: blockedNote,
    blocked_reason: blockedReason,
    unblock_needed: unblockNeeded,
    waiting_on: waitingOn,
    source_url: sourceUrl,
    agent_id: agentId,
    project_id: projectId,
    assignee_agent_id: assigneeAgentId,
    assignee_herzen: assigneeHerzen,
    due_on: dueOn,
    parent_id: parentId,
    external_refs: merged.refs,
    done_at: doneAt,
  };

  const previousRefs = refsOf(current.external_refs);
  const same =
    row.title === current.title &&
    (row.details ?? null) === (current.details ?? null) &&
    row.priority === canonicalPriority(current.priority) &&
    row.status === canonicalStatus(current.status) &&
    row.blocked === current.blocked &&
    (row.blocked_note ?? null) === (current.blocked_note ?? null) &&
    (row.blocked_reason ?? null) === (current.blocked_reason ?? null) &&
    (row.unblock_needed ?? null) === (current.unblock_needed ?? null) &&
    (row.waiting_on ?? null) === (current.waiting_on ?? null) &&
    (row.source_url ?? null) === (current.source_url ?? null) &&
    row.agent_id === current.agent_id &&
    (row.project_id ?? null) === (current.project_id ?? null) &&
    (row.assignee_agent_id ?? null) === (current.assignee_agent_id ?? null) &&
    row.assignee_herzen === Boolean(current.assignee_herzen) &&
    (row.due_on ?? null) === (current.due_on ?? null) &&
    (row.parent_id ?? null) === (current.parent_id ?? null) &&
    JSON.stringify(row.external_refs) === JSON.stringify(previousRefs) &&
    (row.done_at ?? null) === (current.done_at ?? null);

  const previous = blockSnapshot(current);
  const nextSnap = blockSnapshot(row);
  let blockEvent: TaskPlan["blockEvent"] = null;
  if (current.blocked && !row.blocked) blockEvent = { action: "cleared", snapshot: previous };
  else if (!current.blocked && row.blocked) blockEvent = { action: "blocked", snapshot: nextSnap };
  else if (row.blocked && JSON.stringify(previous) !== JSON.stringify(nextSnap)) {
    blockEvent = { action: "updated", snapshot: nextSnap };
  }

  const parts: { verb: string; text: string }[] = [];
  if (row.status !== canonicalStatus(current.status)) {
    parts.push({ verb: "moved", text: `moved ${quote(title)} to ${statusLabel(row.status)}` });
  }
  if (row.blocked && !current.blocked) {
    parts.push({ verb: "blocked", text: `marked ${quote(title)} blocked` });
  } else if (!row.blocked && current.blocked && !closes) {
    parts.push({ verb: "unblocked", text: `cleared the block on ${quote(title)}` });
  }
  const blockTextChanged = JSON.stringify(previous) !== JSON.stringify(nextSnap);
  if (
    !closes &&
    blockTextChanged &&
    !parts.some((part) => part.verb === "blocked" || part.verb === "unblocked")
  ) {
    parts.push({ verb: "updated", text: `updated the block on ${quote(title)}` });
  }
  if (row.priority !== canonicalPriority(current.priority)) {
    const raised = row.priority === "high" || row.priority === "urgent";
    parts.push({
      verb: "priority",
      text: raised
        ? `raised ${quote(title)} to ${priorityLabel(row.priority)}`
        : `set ${quote(title)} to ${priorityLabel(row.priority)}`,
    });
  }
  if (row.agent_id !== current.agent_id) {
    parts.push({ verb: "reassigned", text: `reassigned ${quote(title)} to ${ctx.nextAgentName}` });
  }
  if ((row.project_id ?? null) !== (current.project_id ?? null)) {
    parts.push({
      verb: "project",
      text: row.project_id
        ? `moved ${quote(title)} to ${ctx.nextProjectName ?? "a project"}`
        : `cleared the project on ${quote(title)}`,
    });
  }
  if (
    (row.assignee_agent_id ?? null) !== (current.assignee_agent_id ?? null) ||
    row.assignee_herzen !== Boolean(current.assignee_herzen)
  ) {
    parts.push({
      verb: "assigned",
      text: ctx.nextAssigneeLabel
        ? `assigned ${quote(title)} to ${ctx.nextAssigneeLabel}`
        : `cleared the assignee on ${quote(title)}`,
    });
  }
  if ((row.due_on ?? null) !== (current.due_on ?? null)) {
    parts.push({
      verb: "due",
      text: row.due_on ? `set ${quote(title)} due ${row.due_on}` : `cleared the due date on ${quote(title)}`,
    });
  }
  if ((row.parent_id ?? null) !== (current.parent_id ?? null)) {
    parts.push({
      verb: "parent",
      text: row.parent_id
        ? `nested ${quote(title)} under ${ctx.nextParentLabel ?? "a parent task"}`
        : `cleared the parent of ${quote(title)}`,
    });
  }
  if (JSON.stringify(row.external_refs) !== JSON.stringify(previousRefs)) {
    parts.push({ verb: "updated", text: `updated external refs on ${quote(title)}` });
  }
  if (!parts.length && (row.title !== current.title || (row.details ?? null) !== (current.details ?? null))) {
    parts.push({ verb: "updated", text: `updated ${quote(title)}` });
  }

  return {
    row,
    activity: parts.length
      ? { verb: parts.length === 1 ? parts[0].verb : "updated", summary: parts.map((part) => part.text).join("; ") }
      : null,
    blockEvent,
    promoteLink: urlToKeep ? { url: urlToKeep, kind: inferLinkKind(urlToKeep), label: null } : null,
    unchanged: same,
  };
}

export type ParsedTaskWrite = {
  title?: string;
  details?: string | null;
  priority?: CanonicalPriority;
  status?: CanonicalStatus;
  blocked?: boolean;
  blocked_note?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
  source_url?: string | null;
  project?: string | null;
  assignee?: string | null;
  due_on?: string | null;
  parent?: string | null;
  labels?: string[];
  external_refs?: Record<string, string | null>;
  links?: { kind: LinkKind; url: string; label: string | null }[];
};

function isFieldError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}

function textField(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): string | null | { error: string } {
  if (value === undefined || value === null) {
    if (required) return { error: `${field} is required` };
    return null;
  }
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) return { error: `${field} is required` };
    return null;
  }
  if (trimmed.length > max) return { error: `${field} must be ${max} characters or fewer` };
  return trimmed;
}

export function parseLabels(value: unknown): { ok: true; labels: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "labels must be an array" };
  if (value.length > 20) return { ok: false, error: "labels has too many items" };
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const raw = typeof item === "string" ? item : item && typeof item === "object" && "name" in item ? (item as { name: unknown }).name : null;
    if (typeof raw !== "string") return { ok: false, error: "labels must be names" };
    const name = raw.trim();
    if (!name) return { ok: false, error: "labels cannot contain blank items" };
    if (name.length > 40) return { ok: false, error: "label names must be 40 characters or fewer" };
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(name);
  }
  return { ok: true, labels };
}

function parseDue(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return { error: "due_on must be YYYY-MM-DD" };
  const trimmed = value.trim();
  const date = trimmed.slice(0, 10);
  if (!isIsoDate(date)) return { error: "due_on must be YYYY-MM-DD" };
  return date;
}

export function parseAssignee(value: unknown): { ok: true; assignee: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, assignee: null };
  if (typeof value !== "string") return { ok: false, error: "assignee must be a name or slug" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, assignee: null };
  if (trimmed.length > 80) return { ok: false, error: "assignee must be 80 characters or fewer" };
  const folded = trimmed.toLowerCase();
  if (folded === "herzen" || folded === "tito" || folded === "herzen cortes") return { ok: true, assignee: "herzen" };
  return { ok: true, assignee: trimmed };
}

function parseRefPatch(body: Record<string, unknown>): Record<string, string | null> | { error: string } | undefined {
  const patch: Record<string, string | null> = {};
  let seen = false;
  if ("external_refs" in body) {
    seen = true;
    const value = body.external_refs;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "external_refs must be an object" };
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === null) patch[key] = null;
      else if (typeof entry === "string") patch[key] = entry;
      else return { error: "external_refs values must be strings" };
    }
  }
  for (const key of ["linear_id", "linear_url", "cloud_agent_id"] as const) {
    if (!(key in body)) continue;
    seen = true;
    const entry = body[key];
    if (entry === null || typeof entry === "string") patch[key] = entry;
    else return { error: `${key} must be a string` };
  }
  return seen ? patch : undefined;
}

function parseLinks(value: unknown): ParsedTaskWrite["links"] | { error: string } | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return { error: "links must be an array" };
  if (value.length > 20) return { error: "links has too many items" };
  const links: NonNullable<ParsedTaskWrite["links"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "each link needs a url" };
    const record = item as Record<string, unknown>;
    const url = textField(record.url, "url", 1000, true);
    if (isFieldError(url)) return url;
    if (!url || !isHttpUrl(url)) return { error: "url must be http or https" };
    const kindRaw = record.kind === undefined ? inferLinkKind(url) : record.kind;
    if (typeof kindRaw !== "string" || !LINK_KINDS.includes(kindRaw as LinkKind)) {
      return { error: "link kind must be pr, issue, doc, deploy, or other" };
    }
    const label = textField(record.label, "label", 200, false);
    if (isFieldError(label)) return label;
    links.push({ kind: kindRaw as LinkKind, url, label });
  }
  return links;
}

function sharedFields(body: Record<string, unknown>, write: ParsedTaskWrite): { error: string } | null {
  if ("project" in body || "project_id" in body) {
    const raw = body.project_id ?? body.project;
    const project = textField(raw, "project", 80, false);
    if (isFieldError(project)) return project;
    write.project = project;
  }
  if ("assignee" in body) {
    const assignee = parseAssignee(body.assignee);
    if (!assignee.ok) return assignee;
    write.assignee = assignee.assignee;
  }
  if ("due_on" in body || "due_date" in body || "dueDate" in body) {
    const due = parseDue(body.due_on ?? body.due_date ?? body.dueDate);
    if (isFieldError(due)) return due;
    write.due_on = due;
  }
  if ("parent" in body || "parent_id" in body) {
    const raw = body.parent_id ?? body.parent;
    const parent = textField(raw, "parent", 80, false);
    if (isFieldError(parent)) return parent;
    write.parent = parent;
  }
  if ("labels" in body) {
    const labels = parseLabels(body.labels);
    if (!labels.ok) return labels;
    write.labels = labels.labels;
  }
  const refs = parseRefPatch(body);
  if (isFieldError(refs)) return refs;
  if (refs) write.external_refs = refs;
  const links = parseLinks(body.links);
  if (isFieldError(links)) return links;
  if (links) write.links = links;
  return null;
}

export function parseTaskCreate(body: Record<string, unknown>): { ok: true; value: ParsedTaskWrite } | { ok: false; error: string } {
  const title = textField(body.title, "title", 200, true);
  if (isFieldError(title) || !title) return { ok: false, error: isFieldError(title) ? title.error : "Title is required" };
  const details = textField(body.details ?? body.description, "details", 20000, false);
  if (isFieldError(details)) return { ok: false, error: details.error };
  let priority: CanonicalPriority = "medium";
  if (body.priority !== undefined) {
    const parsed = parsePriority(body.priority);
    if (!parsed.ok) return parsed;
    priority = parsed.priority;
  }
  let status: CanonicalStatus = "todo";
  if (body.status !== undefined) {
    const parsed = parseStatus(body.status);
    if (!parsed.ok) return parsed;
    status = parsed.status;
  }
  let blockedFlag: boolean | undefined;
  if ("blocked" in body) {
    if (typeof body.blocked !== "boolean") return { ok: false, error: "blocked must be true or false" };
    blockedFlag = body.blocked;
  }
  const blockedNote = textField(body.blocked_note, "blocked_note", 1000, false);
  if (isFieldError(blockedNote)) return { ok: false, error: blockedNote.error };
  const blockedReason = textField(body.blocked_reason, "blocked_reason", 1000, false);
  if (isFieldError(blockedReason)) return { ok: false, error: blockedReason.error };
  const unblockNeeded = textField(body.unblock_needed, "unblock_needed", 1000, false);
  if (isFieldError(unblockNeeded)) return { ok: false, error: unblockNeeded.error };
  const waitingOn = textField(body.waiting_on, "waiting_on", 1000, false);
  if (isFieldError(waitingOn)) return { ok: false, error: waitingOn.error };
  let sourceUrl: string | null = null;
  if ("source_url" in body && body.source_url !== undefined && body.source_url !== null && body.source_url !== "") {
    const source = textField(body.source_url, "source_url", 1000, false);
    if (isFieldError(source)) return { ok: false, error: source.error };
    if (source && !isHttpUrl(source)) return { ok: false, error: "source_url must be http or https" };
    sourceUrl = source;
  }
  const blocked = blockedFlag === true || (blockedFlag !== false && Boolean(blockedReason || blockedNote));
  let note = blockedNote;
  if (blocked && !note && blockedReason) note = blockedReason;
  if (blocked && !note) return { ok: false, error: "A blocked task needs a note" };
  let needed = unblockNeeded;
  if (blocked && !needed && waitingOn) needed = waitingOn;

  const value: ParsedTaskWrite = {
    title,
    details,
    priority,
    status,
    blocked,
    blocked_note: blocked ? note : null,
    blocked_reason: blocked ? blockedReason : null,
    unblock_needed: blocked ? needed : null,
    waiting_on: blocked ? waitingOn : null,
    source_url: blocked ? sourceUrl : null,
    links: sourceUrl ? [{ kind: inferLinkKind(sourceUrl), url: sourceUrl, label: null }] : undefined,
  };
  const shared = sharedFields(body, value);
  if (shared) return { ok: false, error: shared.error };
  if (sourceUrl) {
    const links = value.links ?? [];
    if (!links.some((link) => link.url === sourceUrl)) {
      links.push({ kind: inferLinkKind(sourceUrl), url: sourceUrl, label: null });
    }
    value.links = links;
  }
  return { ok: true, value };
}

export function parseTaskPatch(body: Record<string, unknown>): { ok: true; value: ParsedTaskWrite } | { ok: false; error: string } {
  const value: ParsedTaskWrite = {};
  if ("title" in body) {
    const title = textField(body.title, "title", 200, true);
    if (isFieldError(title) || !title) return { ok: false, error: isFieldError(title) ? title.error : "Title is required" };
    value.title = title;
  }
  if ("details" in body || "description" in body) {
    const details = textField(body.details ?? body.description, "details", 20000, false);
    if (isFieldError(details)) return { ok: false, error: details.error };
    value.details = details;
  }
  if ("priority" in body) {
    if (body.priority === undefined) return { ok: false, error: PRIORITY_ERROR };
    const priority = parsePriority(body.priority);
    if (!priority.ok) return priority;
    value.priority = priority.priority;
  }
  if ("status" in body) {
    const status = parseStatus(body.status);
    if (!status.ok) return status;
    value.status = status.status;
  }
  if ("blocked" in body) {
    if (typeof body.blocked !== "boolean") return { ok: false, error: "blocked must be true or false" };
    value.blocked = body.blocked;
  }
  if ("blocked_note" in body) {
    const note = textField(body.blocked_note, "blocked_note", 1000, false);
    if (isFieldError(note)) return { ok: false, error: note.error };
    value.blocked_note = note;
  }
  if ("blocked_reason" in body) {
    const reason = textField(body.blocked_reason, "blocked_reason", 1000, false);
    if (isFieldError(reason)) return { ok: false, error: reason.error };
    value.blocked_reason = reason;
  }
  if ("unblock_needed" in body) {
    const needed = textField(body.unblock_needed, "unblock_needed", 1000, false);
    if (isFieldError(needed)) return { ok: false, error: needed.error };
    value.unblock_needed = needed;
  }
  if ("waiting_on" in body) {
    const waiting = textField(body.waiting_on, "waiting_on", 1000, false);
    if (isFieldError(waiting)) return { ok: false, error: waiting.error };
    value.waiting_on = waiting;
  }
  if ("source_url" in body) {
    if (body.source_url === null || body.source_url === "") value.source_url = null;
    else {
      const source = textField(body.source_url, "source_url", 1000, false);
      if (isFieldError(source)) return { ok: false, error: source.error };
      if (source && !isHttpUrl(source)) return { ok: false, error: "source_url must be http or https" };
      value.source_url = source;
    }
  }
  const shared = sharedFields(body, value);
  if (shared) return { ok: false, error: shared.error };
  return { ok: true, value };
}

export type TaskListQuery = {
  status?: CanonicalStatus;
  priority?: CanonicalPriority;
  project?: string;
  label?: string;
  blocked?: boolean;
  q?: string;
  assignee?: string;
  parent?: string;
  resolution?: "pending";
};

export function parseTaskQuery(params: URLSearchParams): { ok: true; query: TaskListQuery } | { ok: false; error: string } {
  const query: TaskListQuery = {};
  const status = params.get("status");
  if (status) {
    const parsed = parseStatus(status);
    if (!parsed.ok) return parsed;
    query.status = parsed.status;
  }
  const priority = params.get("priority");
  if (priority) {
    const parsed = parsePriority(priority);
    if (!parsed.ok) return parsed;
    query.priority = parsed.priority;
  }
  const project = params.get("project");
  if (project?.trim()) query.project = project.trim();
  const label = params.get("label");
  if (label?.trim()) query.label = label.trim();
  const blocked = params.get("blocked");
  if (blocked !== null && blocked !== "") {
    const folded = blocked.trim().toLowerCase();
    if (folded === "true" || folded === "1" || folded === "yes") query.blocked = true;
    else if (folded === "false" || folded === "0" || folded === "no") query.blocked = false;
    else return { ok: false, error: "blocked must be true or false" };
  }
  const q = params.get("q") ?? params.get("search");
  if (q?.trim()) query.q = q.trim();
  const assignee = params.get("assignee");
  if (assignee?.trim()) {
    const parsed = parseAssignee(assignee);
    if (!parsed.ok) return parsed;
    if (parsed.assignee) query.assignee = parsed.assignee;
  }
  const parent = params.get("parent");
  if (parent?.trim()) query.parent = parent.trim();
  const resolution = params.get("resolution");
  if (resolution !== null && resolution !== "") {
    if (resolution.trim().toLowerCase() !== "pending") return { ok: false, error: "resolution must be pending" };
    query.resolution = "pending";
  }
  return { ok: true, query };
}

export type TaskMatch = Task & {
  project_slug?: string | null;
  project_name?: string | null;
  labels?: string[];
  assignee_slug?: string | null;
  parent_identifier?: string | null;
};

export function taskMatchesQuery(task: TaskMatch, query: TaskListQuery): boolean {
  if (query.status && canonicalStatus(task.status) !== query.status) return false;
  if (query.priority && canonicalPriority(task.priority) !== query.priority) return false;
  if (query.blocked !== undefined && task.blocked !== query.blocked) return false;
  if (query.resolution === "pending") {
    const pending = task.resolution_pending === true || task.resolution_state === "awaiting_agent";
    if (!pending) return false;
  }
  if (query.project) {
    const needle = query.project.toLowerCase();
    const slug = (task.project_slug ?? "").toLowerCase();
    const name = (task.project_name ?? "").toLowerCase();
    const id = (task.project_id ?? "").toLowerCase();
    if (slug !== needle && name !== needle && id !== needle) return false;
  }
  if (query.label) {
    const needle = query.label.toLowerCase();
    const labels = task.labels ?? [];
    if (!labels.some((label) => label.toLowerCase() === needle || slugify(label) === slugify(query.label ?? ""))) return false;
  }
  if (query.assignee) {
    if (query.assignee === "herzen") {
      if (!task.assignee_herzen) return false;
    } else {
      const needle = query.assignee.toLowerCase();
      const slug = (task.assignee_slug ?? "").toLowerCase();
      const id = (task.assignee_agent_id ?? "").toLowerCase();
      if (slug !== needle && id !== needle) return false;
    }
  }
  if (query.parent) {
    const needle = query.parent.toLowerCase();
    const ident = (task.parent_identifier ?? "").toLowerCase();
    const id = (task.parent_id ?? "").toLowerCase();
    const number = parseIdentifier(query.parent);
    if (ident !== needle && id !== needle && !(number && ident === formatIdentifier(number).toLowerCase())) return false;
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    const refs = refsOf(task.external_refs);
    const hay = [
      task.identifier,
      task.title,
      task.details,
      refs.linear_id,
      refs.cloud_agent_id,
      ...(task.labels ?? []),
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function presentTask(
  task: Task,
  extras: {
    agent: string | null;
    project?: Pick<Project, "id" | "name" | "slug"> | null;
    assignee?: string | null;
    parent?: string | null;
    labels?: string[];
    links?: TaskLink[];
    comments?: TaskComment[];
    activity?: { id: string; actor: string; verb: string; summary: string; created_at: string }[];
    block_history?: BlockEvent[];
    subtasks?: { id: string; identifier: string | null; title: string; status: string }[];
  },
) {
  return {
    ...task,
    priority: canonicalPriority(task.priority),
    status: canonicalStatus(task.status),
    external_refs: refsOf(task.external_refs),
    assignee_herzen: Boolean(task.assignee_herzen),
    resolution_state: task.resolution_state ?? "none",
    resolution_pending: Boolean(task.resolution_pending),
    latest_resolution_at: task.latest_resolution_at ?? null,
    resolution_acknowledged_at: task.resolution_acknowledged_at ?? null,
    agent: extras.agent,
    project: extras.project ?? null,
    assignee: task.assignee_herzen ? "herzen" : (extras.assignee ?? null),
    parent: extras.parent ?? null,
    labels: extras.labels ?? [],
    links: extras.links ?? [],
    ...(extras.comments ? { comments: extras.comments } : {}),
    ...(extras.activity ? { activity: extras.activity } : {}),
    ...(extras.block_history ? { block_history: extras.block_history } : {}),
    ...(extras.subtasks ? { subtasks: extras.subtasks } : {}),
  };
}

export function parentCreatesCycle(
  taskId: string,
  parentId: string | null,
  parentOf: Map<string, string | null>,
): boolean {
  if (!parentId) return false;
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === taskId || seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

export function countsAsBlocked(task: Pick<Task, "blocked" | "status">): boolean {
  return task.blocked && !isClosedStatus(task.status);
}
