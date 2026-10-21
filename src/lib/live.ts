import type { Agent, AgentStatusRow, LiveState, Mood } from "@/lib/types";

/** After this long with no agent API call, the card says "Last active" instead of "Active". */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** A write this recent counts as working, even when the posted state is idle. */
export const RECENT_ACTIVITY_MS = 10 * 60 * 1000;

/** A posted working state older than this, with no newer write, is not working. */
export const POSTED_WORKING_MS = 30 * 60 * 1000;

/**
 * Status posts set agent_status.updated_at and then agents.last_active a moment later.
 * A gap inside this window is the same write, not a later one.
 */
export const STATUS_WRITE_SKEW_MS = 15_000;

/** How often the signed-in dashboard asks the server for a new snapshot. */
export const LIVE_POLL_MS = 10_000;

export const WORKING_ON_MAX = 200;

export type LiveAgentView = {
  agent_id: string;
  slug: string;
  name: string;
  /** Working, blocked, or idle after recent writes are taken into account. */
  state: LiveState;
  /** Last posted state. Null when the agent has never posted one. */
  reported_state: LiveState | null;
  /** When the posted state was saved. */
  reported_at: string | null;
  working_on: string;
  /** Last successful agent API call, not only the status-post time. */
  updated_at: string | null;
  stale: boolean;
  focus_label: string;
  time_label: string;
};

export type ActivitySnippet = {
  actor: string;
  summary: string;
  created_at: string;
};

export type ParsedStatus =
  | { ok: true; state: LiveState; workingOn: string }
  | { ok: false; error: string };

export function parseLiveState(value: unknown): { ok: true; state: LiveState } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: false, error: "state is required" };
  if (value === "working" || value === "idle" || value === "blocked") return { ok: true, state: value };
  return { ok: false, error: "state must be working, idle, or blocked" };
}

export function parseWorkingOn(
  value: unknown,
  state: LiveState,
): { ok: true; workingOn: string } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    if (state === "idle") return { ok: true, workingOn: "" };
    return { ok: false, error: "working_on is required when state is working or blocked" };
  }
  if (typeof value !== "string") return { ok: false, error: "working_on must be a string" };
  const workingOn = value.replace(/\s+/g, " ").trim();
  if (!workingOn) {
    if (state === "idle") return { ok: true, workingOn: "" };
    return { ok: false, error: "working_on is required when state is working or blocked" };
  }
  if (Array.from(workingOn).length > WORKING_ON_MAX) {
    return { ok: false, error: `working_on must be ${WORKING_ON_MAX} characters or fewer` };
  }
  return { ok: true, workingOn };
}

export function parseStatusBody(body: Record<string, unknown>): ParsedStatus {
  const state = parseLiveState(body.state);
  if (!state.ok) return state;
  const workingOn = parseWorkingOn(body.working_on, state.state);
  if (!workingOn.ok) return workingOn;
  return { ok: true, state: state.state, workingOn: workingOn.workingOn };
}

export function isLastActiveStale(lastActive: string, now: Date): boolean {
  const stamp = new Date(lastActive).getTime();
  if (Number.isNaN(stamp)) return true;
  return now.getTime() - stamp >= STALE_AFTER_MS;
}

/** Poll only while the tab is visible. A hidden tab resumes on the next visibility change. */
export function shouldPollNow(visibility: string): boolean {
  return visibility === "visible";
}

export function updatedAgoLabel(polledAt: number | null, now: number): string {
  if (polledAt === null) return "Updated just now";
  const seconds = Math.max(0, Math.floor((now - polledAt) / 1000));
  return `Updated ${seconds}s ago`;
}

/** Newest ISO timestamp among agent presence and activity rows. */
export function latestIso(values: (string | null | undefined)[]): string | null {
  let bestMs = Number.NEGATIVE_INFINITY;
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = value;
  }
  return best;
}

function stampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const stamp = new Date(iso).getTime();
  return Number.isNaN(stamp) ? null : stamp;
}

export function ageMs(iso: string | null | undefined, now: Date): number | null {
  const stamp = stampMs(iso);
  if (stamp === null) return null;
  return Math.max(0, now.getTime() - stamp);
}

/** True when last_active is a write after the posted status, not the status post itself. */
export function activityAfterStatus(lastActive: string | null, reportedAt: string | null): boolean {
  const active = stampMs(lastActive);
  if (active === null) return false;
  const reported = stampMs(reportedAt);
  if (reported === null) return true;
  return active > reported + STATUS_WRITE_SKEW_MS;
}

export function latestActivitySummary(snippets: ActivitySnippet[] | undefined, actor: string): string | null {
  if (!snippets?.length) return null;
  let best: { at: number; summary: string } | null = null;
  for (const row of snippets) {
    if (row.actor !== actor || !row.summary.trim()) continue;
    const at = stampMs(row.created_at);
    if (at === null) continue;
    if (!best || at >= best.at) best = { at, summary: row.summary.trim() };
  }
  return best?.summary ?? null;
}

/**
 * Blocked stays until a different state is posted.
 * Any other write in the last 10 minutes counts as working.
 * A posted working state counts for 30 minutes unless a newer write already refreshed it.
 * last_active is that write time: report, task, document, outreach, and status/heartbeat.
 */
export function deriveEffectiveState(
  input: {
    reportedState: LiveState | null;
    reportedAt: string | null;
    lastActive: string | null;
    workingOn: string;
    latestActivity: string | null;
  },
  now: Date,
): { state: LiveState; focus: string } {
  const { reportedState, workingOn, latestActivity } = input;
  if (reportedState === "blocked") {
    return { state: "blocked", focus: workingOn || "Blocked" };
  }

  const activeAge = ageMs(input.lastActive, now);
  const reportedAge = ageMs(input.reportedAt, now);
  const recentWrite = activeAge !== null && activeAge < RECENT_ACTIVITY_MS;
  const laterThanStatus = activityAfterStatus(input.lastActive, input.reportedAt);
  const busyNow = recentWrite && (reportedState !== "idle" || laterThanStatus);
  const freshWorking = reportedState === "working" && reportedAge !== null && reportedAge < POSTED_WORKING_MS;

  if (busyNow || freshWorking) {
    if (reportedState === "working" && workingOn) return { state: "working", focus: workingOn };
    if (latestActivity) return { state: "working", focus: latestActivity };
    return { state: "working", focus: "Active" };
  }

  return {
    state: "idle",
    focus: reportedState ? "Nothing in progress" : "No status posted",
  };
}

export function presenceTimeLabel(
  input: { state: LiveState; lastActive: string | null; reportedAt: string | null },
  now: Date,
): { label: string; stale: boolean } {
  if (input.state === "blocked") {
    const age = ageMs(input.reportedAt ?? input.lastActive, now);
    if (age === null) return { label: "Blocked", stale: true };
    if (age < 60_000) return { label: "Blocked just now", stale: false };
    if (age < STALE_AFTER_MS) return { label: `Blocked ${Math.floor(age / 60_000)} min`, stale: false };
    const hours = Math.max(1, Math.floor(age / (60 * 60 * 1000)));
    return { label: `Blocked ${hours} h`, stale: true };
  }

  const base = activityAgeLabel(input.lastActive, now);
  if (input.state === "idle" && input.lastActive && base.label.startsWith("Active ")) {
    return { label: base.label.replace("Active ", "Last active "), stale: base.stale };
  }
  return base;
}

export function effectiveCounts(views: { state: LiveState }[]): { working: number; stuck: number; napping: number } {
  return {
    working: views.filter((view) => view.state === "working").length,
    stuck: views.filter((view) => view.state === "blocked").length,
    napping: views.filter((view) => view.state === "idle").length,
  };
}

export function activityAgeLabel(lastActive: string | null | undefined, now: Date): { label: string; stale: boolean } {
  if (!lastActive) return { label: "No activity yet", stale: true };
  const stamp = new Date(lastActive).getTime();
  if (Number.isNaN(stamp)) return { label: "No activity yet", stale: true };
  const age = Math.max(0, now.getTime() - stamp);
  if (age >= STALE_AFTER_MS) {
    const hours = Math.max(1, Math.floor(age / (60 * 60 * 1000)));
    return { label: `Last active ${hours} h ago`, stale: true };
  }
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return { label: "Active just now", stale: false };
  return { label: `Active ${minutes} min ago`, stale: false };
}

export function liveStatusLabel(state: LiveState): string {
  if (state === "working") return "Working";
  if (state === "blocked") return "Blocked";
  return "Idle";
}

export function livePillMood(state: LiveState): Mood {
  if (state === "working") return "active";
  if (state === "blocked") return "blocked";
  return "idle";
}

export function statusActivitySummary(state: LiveState, workingOn: string): string {
  if (state === "working") return `is working on “${workingOn}”`;
  if (state === "blocked") return `is blocked on “${workingOn}”`;
  if (workingOn) return `is idle · “${workingOn}”`;
  return "is idle";
}

export function presentLiveStatus(
  agents: Agent[],
  rows: AgentStatusRow[],
  now = new Date(),
  activity: ActivitySnippet[] = [],
): LiveAgentView[] {
  const byAgent = new Map(rows.map((row) => [row.agent_id, row]));
  return agents.map((agent) => {
    const row = byAgent.get(agent.id);
    const reportedState = row?.state ?? null;
    const workingOn = row?.working_on ?? "";
    const derived = deriveEffectiveState(
      {
        reportedState,
        reportedAt: row?.updated_at ?? null,
        lastActive: agent.last_active,
        workingOn,
        latestActivity: latestActivitySummary(activity, agent.slug),
      },
      now,
    );
    const time = presenceTimeLabel(
      { state: derived.state, lastActive: agent.last_active, reportedAt: row?.updated_at ?? null },
      now,
    );
    return {
      agent_id: agent.id,
      slug: agent.slug,
      name: agent.name,
      state: derived.state,
      reported_state: reportedState,
      reported_at: row?.updated_at ?? null,
      working_on: workingOn,
      updated_at: agent.last_active,
      stale: time.stale,
      focus_label: derived.focus,
      time_label: time.label,
    };
  });
}
