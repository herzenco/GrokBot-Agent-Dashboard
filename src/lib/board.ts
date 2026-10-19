import type { ActivityRow, Agent, Mood, Report, Task } from "@/lib/types";
import { formatEtTime } from "@/lib/time";

export type Bubble = {
  kind: "work" | "stuck" | "nap";
  label: string;
  lines: string[];
};

export function moodOf(tasks: Task[]): Mood {
  const open = tasks.filter((task) => task.status !== "done");
  if (open.some((task) => task.blocked)) return "blocked";
  if (open.some((task) => task.status === "doing")) return "active";
  return "idle";
}

export function isDoneOnDay(task: Task, startMs: number, endMs: number): boolean {
  if (task.status !== "done" || !task.done_at) return false;
  const stamp = new Date(task.done_at).getTime();
  return stamp >= startMs && stamp < endMs;
}

export function bubblesFor(tasks: Task[], todoCount: number): Bubble[] {
  const doing = tasks.filter((task) => task.status === "doing" && !task.blocked);
  const stuck = tasks.filter((task) => task.blocked && task.status !== "done");
  const bubbles: Bubble[] = [];
  if (doing.length) {
    bubbles.push({ kind: "work", label: "Working on", lines: doing.map((task) => task.title) });
  }
  for (const task of stuck) {
    bubbles.push({
      kind: "stuck",
      label: `Stuck on ${task.title}`,
      lines: [task.blocked_note?.trim() || "Blocked"],
    });
  }
  if (!bubbles.length) {
    const waiting = todoCount === 1 ? "1 waiting" : `${todoCount} waiting`;
    bubbles.push({
      kind: "nap",
      label: "Napping",
      lines: [`Nothing in progress. ${waiting} in To do.`],
    });
  }
  return bubbles;
}

export type AgentCard = {
  agent: Agent;
  mood: Mood;
  todo: number;
  doing: number;
  doneToday: string[];
  doneCount: number;
  bubbles: Bubble[];
  reportLabel: string;
  reportPosted: boolean;
};

export type BoardStats = {
  todo: number;
  doing: number;
  doneToday: number;
  blocked: number;
  reportsPosted: number;
  reportsMissing: number;
  working: number;
  stuck: number;
  napping: number;
};

export function buildBoard(
  agents: Agent[],
  tasks: Task[],
  reports: Report[],
  startMs: number,
  endMs: number,
): { cards: AgentCard[]; stats: BoardStats } {
  const reportsByAgent = new Map(reports.map((report) => [report.agent_id, report]));
  const cards = agents.map((agent) => {
    const mine = tasks.filter((task) => task.agent_id === agent.id);
    const todo = mine.filter((task) => task.status === "todo").length;
    const doing = mine.filter((task) => task.status === "doing").length;
    const doneToday = mine
      .filter((task) => isDoneOnDay(task, startMs, endMs))
      .sort((a, b) => (a.done_at ?? "").localeCompare(b.done_at ?? ""))
      .map((task) => task.title);
    const report = reportsByAgent.get(agent.id);
    return {
      agent,
      mood: moodOf(mine),
      todo,
      doing,
      doneToday,
      doneCount: doneToday.length,
      bubbles: bubblesFor(mine, todo),
      reportPosted: Boolean(report),
      reportLabel: report ? `Report posted ${formatEtTime(new Date(report.posted_at))}` : "Report missing",
    };
  });
  const stats: BoardStats = {
    todo: cards.reduce((sum, card) => sum + card.todo, 0),
    doing: cards.reduce((sum, card) => sum + card.doing, 0),
    doneToday: cards.reduce((sum, card) => sum + card.doneCount, 0),
    blocked: tasks.filter((task) => task.blocked && task.status !== "done").length,
    reportsPosted: cards.filter((card) => card.reportPosted).length,
    reportsMissing: cards.filter((card) => !card.reportPosted).length,
    working: cards.filter((card) => card.mood === "active").length,
    stuck: cards.filter((card) => card.mood === "blocked").length,
    napping: cards.filter((card) => card.mood === "idle").length,
  };
  return { cards, stats };
}

export type ActivityView = {
  id: string;
  actor: string;
  actorName: string;
  summary: string;
  timeLabel: string;
  mood: Mood;
  emphasize: boolean;
  isTito: boolean;
};

export function presentActivity(rows: ActivityRow[], agents: Agent[], moods: Map<string, Mood>): ActivityView[] {
  const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  return rows.map((row) => {
    const isTito = row.actor === "tito";
    const agent = bySlug.get(row.actor) ?? byName.get(row.actor);
    return {
      id: row.id,
      actor: row.actor,
      actorName: isTito ? "Tito" : (agent?.name ?? row.actor),
      summary: row.summary,
      timeLabel: `${formatEtTime(new Date(row.created_at))} ET`,
      mood: agent ? (moods.get(agent.id) ?? "active") : "active",
      emphasize: row.verb === "blocked",
      isTito,
    };
  });
}

export function statusLabel(mood: Mood): string {
  if (mood === "blocked") return "Blocked";
  if (mood === "idle") return "Idle";
  return "Active";
}
