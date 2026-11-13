import { formatIsoWeekday, isIsoDate } from "@/lib/time";
import {
  canonicalPriority,
  formatIdentifier,
  isClosedStatus,
  priorityLabel,
  priorityRank,
  statusLabel,
  type CanonicalPriority,
} from "@/lib/work";

/**
 * `tasks.waiting_on` is free text ("who or what a blocked task is waiting on"),
 * not a foreign key. A Herzen mention matches as a word, so "Herzen", "herzen",
 * and "Herzen Cortes" count, and "herzegovina" does not. "Tito" is Herzen's
 * name on this dashboard, so that exact value counts too.
 */
const HERZEN_WORD = /\bherzen\b/i;

export type MyTaskSource = {
  id: string;
  identifier?: string | null;
  number?: number | null;
  title: string;
  status: string;
  priority: string;
  blocked: boolean;
  blocked_reason?: string | null;
  blocked_note?: string | null;
  waiting_on?: string | null;
  assignee_herzen?: boolean | null;
  due_on?: string | null;
  agent_id: string;
  project_id?: string | null;
  project_name?: string | null;
};

export type MyTaskAgentRef = {
  id: string;
  name: string;
  sort_order: number;
};

export type MyTaskProjectRef = {
  id: string;
  name: string;
};

export type MyTaskItem = {
  id: string;
  href: string;
  identifier: string | null;
  title: string;
  statusLabel: string;
  priority: CanonicalPriority;
  priorityLabel: string;
  projectName: string | null;
  blockedReason: string | null;
  dueOn: string | null;
  dueLabel: string | null;
  overdue: boolean;
  assigned: boolean;
  waiting: boolean;
  agentId: string;
  agentName: string;
};

export type MyTaskGroup = {
  agentId: string;
  agentName: string;
  tasks: MyTaskItem[];
};

export type MyTaskSelection = {
  count: number;
  overdue: number;
  summary: string;
  groups: MyTaskGroup[];
};

export function waitingOnHerzen(value: string | null | undefined): boolean {
  if (!value) return false;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (HERZEN_WORD.test(text)) return true;
  return /^tito$/i.test(text);
}

export function isHerzenOpenTask(
  task: Pick<MyTaskSource, "status" | "assignee_herzen" | "blocked" | "waiting_on">,
): boolean {
  if (isClosedStatus(task.status)) return false;
  if (task.assignee_herzen === true) return true;
  return task.blocked === true && waitingOnHerzen(task.waiting_on);
}

export function myTaskSummary(count: number, overdue: number): string {
  if (count === 0) return "No open tasks";
  const tasks = count === 1 ? "1 open task" : `${count} open tasks`;
  if (overdue === 0) return tasks;
  return `${tasks} · ${overdue} overdue`;
}

function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.trim().slice(0, 10);
  return isIsoDate(date) ? date : null;
}

function taskIdentifier(task: MyTaskSource): string | null {
  const identifier = task.identifier?.trim();
  if (identifier) return identifier;
  if (typeof task.number === "number" && Number.isInteger(task.number) && task.number >= 1) {
    return formatIdentifier(task.number);
  }
  return null;
}

function blockedReasonOf(task: MyTaskSource): string | null {
  if (!task.blocked) return null;
  const reason = task.blocked_reason?.replace(/\s+/g, " ").trim() || task.blocked_note?.replace(/\s+/g, " ").trim() || "";
  return reason || null;
}

function dueBucket(dueOn: string | null, today: string): number {
  if (!dueOn) return 2;
  if (dueOn < today) return 0;
  return 1;
}

type Draft = { source: MyTaskSource; item: MyTaskItem };

function compareDrafts(a: Draft, b: Draft, today: string, agentById: Map<string, MyTaskAgentRef>): number {
  const bucket = dueBucket(a.item.dueOn, today) - dueBucket(b.item.dueOn, today);
  if (bucket !== 0) return bucket;
  if (a.item.dueOn && b.item.dueOn && a.item.dueOn !== b.item.dueOn) {
    return a.item.dueOn < b.item.dueOn ? -1 : 1;
  }
  const rank = priorityRank(a.source.priority) - priorityRank(b.source.priority);
  if (rank !== 0) return rank;
  const order =
    (agentById.get(a.item.agentId)?.sort_order ?? Number.MAX_SAFE_INTEGER) -
    (agentById.get(b.item.agentId)?.sort_order ?? Number.MAX_SAFE_INTEGER);
  if (order !== 0) return order;
  const name = a.item.agentName.localeCompare(b.item.agentName);
  if (name !== 0) return name;
  const identifier = (a.item.identifier ?? "").localeCompare(b.item.identifier ?? "", undefined, { numeric: true });
  if (identifier !== 0) return identifier;
  return a.item.id.localeCompare(b.item.id);
}

export function selectMyTasks(
  tasks: MyTaskSource[],
  agents: MyTaskAgentRef[],
  today: string,
  projects: MyTaskProjectRef[] = [],
): MyTaskSelection {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  const seen = new Set<string>();
  const drafts: Draft[] = [];

  for (const task of tasks) {
    if (seen.has(task.id) || !isHerzenOpenTask(task)) continue;
    seen.add(task.id);
    const dueOn = calendarDate(task.due_on);
    const agent = agentById.get(task.agent_id);
    const explicitProject = task.project_name?.trim() || null;
    const identifier = taskIdentifier(task);
    drafts.push({
      source: task,
      item: {
        id: task.id,
        href: `/work/${identifier ?? task.id}`,
        identifier,
        title: task.title,
        statusLabel: statusLabel(task.status),
        priority: canonicalPriority(task.priority),
        priorityLabel: priorityLabel(task.priority),
        projectName: explicitProject ?? (task.project_id ? (projectById.get(task.project_id) ?? null) : null),
        blockedReason: blockedReasonOf(task),
        dueOn,
        dueLabel: dueOn ? formatIsoWeekday(dueOn) : null,
        overdue: Boolean(dueOn && dueOn < today),
        assigned: task.assignee_herzen === true,
        waiting: task.blocked === true && waitingOnHerzen(task.waiting_on),
        agentId: task.agent_id,
        agentName: agent?.name ?? "Unknown",
      },
    });
  }

  const byAgent = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const list = byAgent.get(draft.item.agentId) ?? [];
    list.push(draft);
    byAgent.set(draft.item.agentId, list);
  }

  const groups = [...byAgent.values()]
    .map((list) => {
      const tasksInGroup = [...list].sort((a, b) => compareDrafts(a, b, today, agentById));
      return {
        agentId: tasksInGroup[0].item.agentId,
        agentName: tasksInGroup[0].item.agentName,
        tasks: tasksInGroup.map((draft) => draft.item),
        lead: tasksInGroup[0],
      };
    })
    .sort((a, b) => compareDrafts(a.lead, b.lead, today, agentById));

  const items = groups.flatMap((group) => group.tasks);
  const overdue = items.filter((item) => item.overdue).length;
  return {
    count: items.length,
    overdue,
    summary: myTaskSummary(items.length, overdue),
    groups: groups.map(({ agentId, agentName, tasks: groupTasks }) => ({
      agentId,
      agentName,
      tasks: groupTasks,
    })),
  };
}
