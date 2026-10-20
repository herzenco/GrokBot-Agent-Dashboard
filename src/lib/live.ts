import type { Agent, AgentStatusRow, LiveState, Mood } from "@/lib/types";

/** After this long with no agent API call, the card says "Last active" instead of "Active". */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** How often the signed-in dashboard asks the server for a new snapshot. */
export const LIVE_POLL_MS = 10_000;

export const WORKING_ON_MAX = 200;

export type LiveAgentView = {
  agent_id: string;
  slug: string;
  name: string;
  /** Explicit status. A quiet agent keeps working or blocked instead of flipping to idle. */
  state: LiveState;
  /** Last posted state. Null when the agent has never posted one. */
  reported_state: LiveState | null;
  working_on: string;
  /** Last successful agent API call, not the status-post time. */
  updated_at: string | null;
  stale: boolean;
  focus_label: string;
  time_label: string;
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

function focusLabel(row: AgentStatusRow | undefined): string {
  if (!row) return "No status posted";
  if (row.working_on) return row.working_on;
  return "Nothing in progress";
}

export function presentLiveStatus(agents: Agent[], rows: AgentStatusRow[], now = new Date()): LiveAgentView[] {
  const byAgent = new Map(rows.map((row) => [row.agent_id, row]));
  return agents.map((agent) => {
    const row = byAgent.get(agent.id);
    const age = activityAgeLabel(agent.last_active, now);
    return {
      agent_id: agent.id,
      slug: agent.slug,
      name: agent.name,
      state: row?.state ?? "idle",
      reported_state: row?.state ?? null,
      working_on: row?.working_on ?? "",
      updated_at: agent.last_active,
      stale: age.stale,
      focus_label: focusLabel(row),
      time_label: age.label,
    };
  });
}
