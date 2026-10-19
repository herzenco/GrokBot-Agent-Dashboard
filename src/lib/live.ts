import type { Agent, AgentStatusRow, LiveState, Mood } from "@/lib/types";
import { formatEtTime } from "@/lib/time";

/** Hide a heartbeat that has not been refreshed for this long. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** How often the signed-in dashboard asks the server for a new snapshot. */
export const LIVE_POLL_MS = 10_000;

export const WORKING_ON_MAX = 200;

export type LiveAgentView = {
  agent_id: string;
  slug: string;
  name: string;
  /** Status to show. Stale and missing heartbeats are idle. */
  state: LiveState;
  /** Last posted state. Null when the agent has never posted. */
  reported_state: LiveState | null;
  working_on: string;
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

export function isHeartbeatStale(updatedAt: string, now: Date): boolean {
  const stamp = new Date(updatedAt).getTime();
  if (Number.isNaN(stamp)) return true;
  return now.getTime() - stamp >= STALE_AFTER_MS;
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

function focusLabel(updatedAt: string | null, workingOn: string): string {
  if (!updatedAt) return "No update yet";
  if (workingOn) return workingOn;
  return "Nothing in progress";
}

function timeLabel(updatedAt: string | null, stale: boolean): string {
  if (!updatedAt) return "No heartbeat yet";
  const formatted = `${formatEtTime(new Date(updatedAt))} ET`;
  if (stale) return `Stale · last update ${formatted}`;
  return `Updated ${formatted}`;
}

export function presentLiveStatus(agents: Agent[], rows: AgentStatusRow[], now = new Date()): LiveAgentView[] {
  const byAgent = new Map(rows.map((row) => [row.agent_id, row]));
  return agents.map((agent) => {
    const row = byAgent.get(agent.id);
    if (!row) {
      return {
        agent_id: agent.id,
        slug: agent.slug,
        name: agent.name,
        state: "idle",
        reported_state: null,
        working_on: "",
        updated_at: null,
        stale: true,
        focus_label: "No update yet",
        time_label: "No heartbeat yet",
      };
    }
    const stale = isHeartbeatStale(row.updated_at, now);
    return {
      agent_id: agent.id,
      slug: agent.slug,
      name: agent.name,
      state: stale ? "idle" : row.state,
      reported_state: row.state,
      working_on: row.working_on,
      updated_at: row.updated_at,
      stale,
      focus_label: focusLabel(row.updated_at, row.working_on),
      time_label: timeLabel(row.updated_at, stale),
    };
  });
}
