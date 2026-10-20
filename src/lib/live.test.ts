import { describe, expect, it } from "vitest";
import {
  STALE_AFTER_MS,
  activityAgeLabel,
  isLastActiveStale,
  latestIso,
  parseStatusBody,
  presentLiveStatus,
  shouldPollNow,
  statusActivitySummary,
  updatedAgoLabel,
} from "@/lib/live";
import type { Agent, AgentStatusRow } from "@/lib/types";

const now = new Date("2026-10-19T18:00:00.000Z");

const agents: Agent[] = [
  { id: "a", slug: "roger", name: "Roger", role: "Chief of staff", sort_order: 1, last_active: null },
  { id: "b", slug: "chopper", name: "Chopper", role: "Herzen Co.", sort_order: 2, last_active: null },
];

function row(partial: Partial<AgentStatusRow> & Pick<AgentStatusRow, "agent_id" | "updated_at">): AgentStatusRow {
  return {
    state: "working",
    working_on: "Weekly priorities memo",
    ...partial,
  };
}

describe("status body validation", () => {
  it("accepts a working heartbeat and collapses whitespace", () => {
    expect(parseStatusBody({ state: "working", working_on: "  Weekly   priorities \n memo  " })).toEqual({
      ok: true,
      state: "working",
      workingOn: "Weekly priorities memo",
    });
  });

  it("lets idle omit the working text", () => {
    expect(parseStatusBody({ state: "idle" })).toEqual({ ok: true, state: "idle", workingOn: "" });
    expect(parseStatusBody({ state: "idle", working_on: "   " })).toEqual({ ok: true, state: "idle", workingOn: "" });
    expect(parseStatusBody({ state: "idle", working_on: null })).toEqual({ ok: true, state: "idle", workingOn: "" });
  });

  it("rejects missing, mistyped, and oversized fields", () => {
    expect(parseStatusBody({})).toEqual({ ok: false, error: "state is required" });
    expect(parseStatusBody({ state: "Working" })).toEqual({
      ok: false,
      error: "state must be working, idle, or blocked",
    });
    expect(parseStatusBody({ state: "working " })).toEqual({
      ok: false,
      error: "state must be working, idle, or blocked",
    });
    expect(parseStatusBody({ state: "blocked" })).toEqual({
      ok: false,
      error: "working_on is required when state is working or blocked",
    });
    expect(parseStatusBody({ state: "working", working_on: 12 })).toEqual({
      ok: false,
      error: "working_on must be a string",
    });
    expect(parseStatusBody({ state: "working", working_on: "  " })).toEqual({
      ok: false,
      error: "working_on is required when state is working or blocked",
    });
    expect(parseStatusBody({ state: "blocked", working_on: "x".repeat(201) })).toEqual({
      ok: false,
      error: "working_on must be 200 characters or fewer",
    });
    expect(parseStatusBody({ state: "idle", working_on: "y".repeat(200) }).ok).toBe(true);
  });
});

describe("presence age", () => {
  it("uses one 2 hour mark for active versus last active", () => {
    expect(STALE_AFTER_MS).toBe(2 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - STALE_AFTER_MS + 1).toISOString();
    const boundary = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
    expect(isLastActiveStale(fresh, now)).toBe(false);
    expect(isLastActiveStale(boundary, now)).toBe(true);
    expect(isLastActiveStale("not-a-date", now)).toBe(true);
    expect(activityAgeLabel(fresh, now)).toEqual({ label: "Active 119 min ago", stale: false });
    expect(activityAgeLabel(boundary, now)).toEqual({ label: "Last active 2 h ago", stale: true });
    expect(activityAgeLabel(new Date(now.getTime() - 4 * 60 * 1000).toISOString(), now)).toEqual({
      label: "Active 4 min ago",
      stale: false,
    });
    expect(activityAgeLabel(new Date(now.getTime() - 30 * 1000).toISOString(), now)).toEqual({
      label: "Active just now",
      stale: false,
    });
    expect(activityAgeLabel(new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), now)).toEqual({
      label: "Last active 5 h ago",
      stale: true,
    });
    expect(activityAgeLabel(null, now)).toEqual({ label: "No activity yet", stale: true });
  });

  it("keeps a posted working or blocked state after the agent goes quiet", () => {
    const quiet = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
    const views = presentLiveStatus(
      [
        { ...agents[0], last_active: recent },
        { ...agents[1], last_active: quiet },
      ],
      [
        row({ agent_id: "a", state: "working", working_on: "Weekly priorities memo", updated_at: quiet }),
        row({ agent_id: "b", state: "blocked", working_on: "Waiting on Matt", updated_at: quiet }),
      ],
      now,
    );

    expect(views[0]).toMatchObject({
      slug: "roger",
      state: "working",
      reported_state: "working",
      stale: false,
      focus_label: "Weekly priorities memo",
      time_label: "Active 4 min ago",
    });
    expect(views[1]).toMatchObject({
      slug: "chopper",
      state: "blocked",
      reported_state: "blocked",
      stale: true,
      focus_label: "Waiting on Matt",
      time_label: "Last active 5 h ago",
    });
  });

  it("shows idle with no status and no activity", () => {
    const [view] = presentLiveStatus(agents.slice(0, 1), [], now);
    expect(view).toMatchObject({
      state: "idle",
      reported_state: null,
      stale: true,
      focus_label: "No status posted",
      time_label: "No activity yet",
    });
  });

  it("describes an idle status with no text", () => {
    const [view] = presentLiveStatus(
      [{ ...agents[0], last_active: now.toISOString() }],
      [row({ agent_id: "a", state: "idle", working_on: "", updated_at: now.toISOString() })],
      now,
    );
    expect(view.focus_label).toBe("Nothing in progress");
    expect(view.state).toBe("idle");
    expect(view.time_label).toBe("Active just now");
    expect(statusActivitySummary("working", "Weekly priorities memo")).toBe("is working on “Weekly priorities memo”");
    expect(statusActivitySummary("blocked", "Waiting on Matt")).toBe("is blocked on “Waiting on Matt”");
    expect(statusActivitySummary("idle", "")).toBe("is idle");
    expect(statusActivitySummary("idle", "Back at 3")).toBe("is idle · “Back at 3”");
  });
});

describe("live poll clock", () => {
  it("counts seconds since the last successful poll", () => {
    expect(updatedAgoLabel(null, 1_000)).toBe("Updated just now");
    expect(updatedAgoLabel(1_000, 1_000)).toBe("Updated 0s ago");
    expect(updatedAgoLabel(1_000, 4_200)).toBe("Updated 3s ago");
    expect(updatedAgoLabel(5_000, 1_000)).toBe("Updated 0s ago");
  });

  it("uses the newest timestamp across agents and the feed", () => {
    expect(latestIso([null, undefined, ""])).toBeNull();
    expect(latestIso(["not-a-date", "2026-10-19T18:00:00.000Z"])).toBe("2026-10-19T18:00:00.000Z");
    expect(
      latestIso(["2026-10-19T17:00:00.000Z", "2026-10-19T18:04:00.000Z", "2026-10-19T18:01:00.000Z"]),
    ).toBe("2026-10-19T18:04:00.000Z");
  });

  it("polls while the tab is visible and resumes when it becomes visible again", () => {
    expect(shouldPollNow("visible")).toBe(true);
    expect(shouldPollNow("hidden")).toBe(false);
    expect(shouldPollNow("prerender")).toBe(false);
  });
});
