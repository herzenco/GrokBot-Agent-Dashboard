import { describe, expect, it } from "vitest";
import {
  STALE_AFTER_MS,
  isHeartbeatStale,
  parseStatusBody,
  presentLiveStatus,
  statusActivitySummary,
} from "@/lib/live";
import type { Agent, AgentStatusRow } from "@/lib/types";

const now = new Date("2026-10-19T18:00:00.000Z");

const agents: Agent[] = [
  { id: "a", slug: "roger", name: "Roger", role: "Chief of staff", sort_order: 1 },
  { id: "b", slug: "chopper", name: "Chopper", role: "Herzen Co.", sort_order: 2 },
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

describe("heartbeat freshness", () => {
  it("treats a heartbeat as stale at 30 minutes", () => {
    const fresh = new Date(now.getTime() - STALE_AFTER_MS + 1).toISOString();
    const boundary = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
    expect(isHeartbeatStale(fresh, now)).toBe(false);
    expect(isHeartbeatStale(boundary, now)).toBe(true);
    expect(isHeartbeatStale("not-a-date", now)).toBe(true);
  });

  it("shows the posted status while it is fresh and idle once it is stale", () => {
    const freshAt = new Date(now.getTime() - 29 * 60 * 1000).toISOString();
    const staleAt = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
    const views = presentLiveStatus(
      agents,
      [
        row({ agent_id: "a", state: "working", working_on: "Weekly priorities memo", updated_at: freshAt }),
        row({ agent_id: "b", state: "blocked", working_on: "Waiting on Matt", updated_at: staleAt }),
      ],
      now,
    );

    expect(views[0]).toMatchObject({
      slug: "roger",
      state: "working",
      reported_state: "working",
      stale: false,
      focus_label: "Weekly priorities memo",
      time_label: "Updated 1:31 PM ET",
    });
    expect(views[1]).toMatchObject({
      slug: "chopper",
      state: "idle",
      reported_state: "blocked",
      stale: true,
      focus_label: "Waiting on Matt",
      time_label: "Stale · last update 1:30 PM ET",
    });
  });

  it("shows idle with no heartbeat", () => {
    const [view] = presentLiveStatus(agents.slice(0, 1), [], now);
    expect(view).toMatchObject({
      state: "idle",
      reported_state: null,
      stale: true,
      focus_label: "No update yet",
      time_label: "No heartbeat yet",
    });
  });

  it("describes an idle heartbeat with no text", () => {
    const [view] = presentLiveStatus(
      agents.slice(0, 1),
      [row({ agent_id: "a", state: "idle", working_on: "", updated_at: now.toISOString() })],
      now,
    );
    expect(view.focus_label).toBe("Nothing in progress");
    expect(view.state).toBe("idle");
    expect(statusActivitySummary("working", "Weekly priorities memo")).toBe("is working on “Weekly priorities memo”");
    expect(statusActivitySummary("blocked", "Waiting on Matt")).toBe("is blocked on “Waiting on Matt”");
    expect(statusActivitySummary("idle", "")).toBe("is idle");
    expect(statusActivitySummary("idle", "Back at 3")).toBe("is idle · “Back at 3”");
  });
});
