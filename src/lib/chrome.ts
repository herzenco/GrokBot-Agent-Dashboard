import "server-only";
import { connection } from "next/server";
import { buildBoard, presentActivity, type ActivityView, type BoardReportFallback } from "@/lib/board";
import { listActivity, listAgentStatus, listAgents, listLatestReportsByAgent, listReports, listTasks } from "@/lib/data";
import { moodMap, presentLiveStatus, type LiveAgentView } from "@/lib/live";
import { etDayRange, etTodayISO } from "@/lib/time";
import type { Agent, Mood, Task } from "@/lib/types";

export async function loadChrome(now = new Date()): Promise<{
  agents: Agent[];
  tasks: Task[];
  live: LiveAgentView[];
  activity: ActivityView[];
  now: Date;
  date: string;
  startMs: number;
  endMs: number;
  moods: Map<string, Mood>;
}> {
  await connection();
  const date = etTodayISO(now);
  const range = etDayRange(date);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(now.getTime() + 60_000).toISOString();
  const [agents, tasks, feedRows, recentRows, statuses] = await Promise.all([
    listAgents(),
    listTasks(),
    listActivity(range.start.toISOString(), range.end.toISOString()),
    listActivity(since, until),
    listAgentStatus(),
  ]);
  const live = presentLiveStatus(agents, statuses, now, recentRows);
  const moods = moodMap(live);
  return {
    agents,
    tasks,
    live,
    activity: presentActivity(feedRows, agents, moods),
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
  let latest: BoardReportFallback | null = null;
  if (reports.length === 0) {
    const prior = await listLatestReportsByAgent();
    if (prior.length > 0) {
      const date = prior.reduce(
        (max, report) => (report.report_date > max ? report.report_date : max),
        prior[0].report_date,
      );
      if (date && date !== chrome.date) {
        latest = {
          date,
          posted: prior.filter((report) => report.report_date === date).length,
          reports: prior,
        };
      }
    }
  }
  const board = buildBoard(
    chrome.agents,
    chrome.tasks,
    reports,
    chrome.startMs,
    chrome.endMs,
    chrome.live,
    latest,
  );
  return { ...chrome, ...board };
}
