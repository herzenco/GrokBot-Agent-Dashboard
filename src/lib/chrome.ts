import "server-only";
import { buildBoard, moodOf, presentActivity, type ActivityView } from "@/lib/board";
import { listActivity, listAgents, listReports, listTasks } from "@/lib/data";
import { etDayRange, etTodayISO } from "@/lib/time";
import type { Agent, Mood, Task } from "@/lib/types";

export async function loadChrome(now = new Date()): Promise<{
  agents: Agent[];
  tasks: Task[];
  activity: ActivityView[];
  now: Date;
  date: string;
  startMs: number;
  endMs: number;
  moods: Map<string, Mood>;
}> {
  const date = etTodayISO(now);
  const range = etDayRange(date);
  const [agents, tasks, rows] = await Promise.all([
    listAgents(),
    listTasks(),
    listActivity(range.start.toISOString(), range.end.toISOString()),
  ]);
  const moods = new Map<string, Mood>();
  for (const agent of agents) {
    moods.set(
      agent.id,
      moodOf(tasks.filter((task) => task.agent_id === agent.id)),
    );
  }
  return {
    agents,
    tasks,
    activity: presentActivity(rows, agents, moods),
    now,
    date,
    startMs: range.start.getTime(),
    endMs: range.end.getTime(),
    moods,
  };
}

export async function loadBoard(now = new Date()) {
  const chrome = await loadChrome(now);
  const reports = await listReports(chrome.date);
  const board = buildBoard(chrome.agents, chrome.tasks, reports, chrome.startMs, chrome.endMs);
  return { ...chrome, ...board };
}
