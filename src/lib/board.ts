import { livePillMood, type LiveAgentView } from "@/lib/live";
import { formatEtTime, formatIsoMonthDay } from "@/lib/time";
import type { ActivityRow, Agent, Mood, Report, Task } from "@/lib/types";

export type Bubble = {
  kind: "work" | "stuck" | "nap";
  label: string;
  lines: string[];
};

export function isDoneOnDay(task: Task, startMs: number, endMs: number): boolean {
  if (task.status !== "done" || !task.done_at) return false;
  const stamp = new Date(task.done_at).getTime();
  return stamp >= startMs && stamp < endMs;
}

/** Speech bubble for the effective live state. The task queue does not choose working, stuck, or napping. */
export function bubblesForLive(
  view: Pick<LiveAgentView, "state" | "focus_label" | "time_label"> | undefined,
  todoCount: number,
): Bubble[] {
  if (view?.state === "working") {
    return [{ kind: "work", label: "Working on", lines: [view.focus_label || "Active"] }];
  }
  if (view?.state === "blocked") {
    const label = view.focus_label ? `Stuck on ${view.focus_label}` : "Stuck";
    return [{ kind: "stuck", label, lines: [view.time_label] }];
  }
  const waiting = todoCount === 1 ? "1 waiting" : `${todoCount} waiting`;
  return [
    {
      kind: "nap",
      label: "Napping",
      lines: [`Nothing in progress. ${waiting} in To do.`],
    },
  ];
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
  reportTone: "posted" | "latest" | "missing";
};

export type BoardStats = {
  todo: number;
  doing: number;
  doneToday: number;
  blocked: number;
  reportsPosted: number;
  reportsMissing: number;
  /** Set when today has no reports and an earlier day does. */
  latestReportDate: string | null;
  latestReportsPosted: number;
  working: number;
  stuck: number;
  napping: number;
};

export type BoardReportFallback = {
  date: string;
  posted: number;
  reports: Report[];
};

export function buildBoard(
  agents: Agent[],
  tasks: Task[],
  reports: Report[],
  startMs: number,
  endMs: number,
  live: LiveAgentView[],
  latest?: BoardReportFallback | null,
): { cards: AgentCard[]; stats: BoardStats } {
  const reportsByAgent = new Map(reports.map((report) => [report.agent_id, report]));
  const liveByAgent = new Map(live.map((view) => [view.agent_id, view]));
  const useLatest = reports.length === 0 && Boolean(latest?.date);
  const latestByAgent = new Map((latest?.reports ?? []).map((report) => [report.agent_id, report]));
  const cards = agents.map((agent) => {
    const mine = tasks.filter((task) => task.agent_id === agent.id);
    const todo = mine.filter((task) => task.status === "todo").length;
    const doing = mine.filter((task) => task.status === "doing").length;
    const doneToday = mine
      .filter((task) => isDoneOnDay(task, startMs, endMs))
      .sort((a, b) => (a.done_at ?? "").localeCompare(b.done_at ?? ""))
      .map((task) => task.title);
    const report = reportsByAgent.get(agent.id);
    const prior = useLatest ? latestByAgent.get(agent.id) : undefined;
    const view = liveByAgent.get(agent.id);
    let reportLabel = "Report missing";
    let reportTone: AgentCard["reportTone"] = "missing";
    if (report) {
      reportLabel = `Report posted ${formatEtTime(new Date(report.posted_at))}`;
      reportTone = "posted";
    } else if (prior) {
      reportLabel = `Latest report ${formatIsoMonthDay(prior.report_date)}`;
      reportTone = "latest";
    }
    return {
      agent,
      mood: view ? livePillMood(view.state) : "idle",
      todo,
      doing,
      doneToday,
      doneCount: doneToday.length,
      bubbles: bubblesForLive(view, todo),
      reportPosted: Boolean(report),
      reportLabel,
      reportTone,
    };
  });
  const stats: BoardStats = {
    todo: cards.reduce((sum, card) => sum + card.todo, 0),
    doing: cards.reduce((sum, card) => sum + card.doing, 0),
    doneToday: cards.reduce((sum, card) => sum + card.doneCount, 0),
    blocked: tasks.filter((task) => task.blocked && task.status !== "done").length,
    reportsPosted: cards.filter((card) => card.reportPosted).length,
    reportsMissing: cards.filter((card) => !card.reportPosted).length,
    latestReportDate: useLatest && latest ? latest.date : null,
    latestReportsPosted: useLatest && latest ? latest.posted : 0,
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
  createdAt: string;
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
      createdAt: row.created_at,
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
