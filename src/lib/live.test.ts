import { describe, expect, it } from "vitest";
import {
  POSTED_WORKING_MS,
  RECENT_ACTIVITY_MS,
  STALE_AFTER_MS,
  activityAgeLabel,
  deriveEffectiveState,
  effectiveCounts,
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
      blockedReason: null,
      unblockNeeded: null,
    });
  });

  it("lets idle omit the working text", () => {
    expect(parseStatusBody({ state: "idle" })).toEqual({
      ok: true,
      state: "idle",
      workingOn: "",
      blockedReason: null,
      unblockNeeded: null,
    });
    expect(parseStatusBody({ state: "idle", working_on: "   " })).toEqual({
      ok: true,
      state: "idle",
      workingOn: "",
      blockedReason: null,
      unblockNeeded: null,
    });
    expect(parseStatusBody({ state: "idle", working_on: null })).toEqual({
      ok: true,
      state: "idle",
      workingOn: "",
      blockedReason: null,
      unblockNeeded: null,
    });
  });

  it("keeps block details only while the state is blocked", () => {
    expect(
      parseStatusBody({
        state: "blocked",
        working_on: "Waiting on Herzen",
        blocked_reason: "  Review pending  ",
        unblock_needed: "Merge approval",
      }),
    ).toEqual({
      ok: true,
      state: "blocked",
      workingOn: "Waiting on Herzen",
      blockedReason: "Review pending",
      unblockNeeded: "Merge approval",
    });
    expect(
      parseStatusBody({
        state: "working",
        working_on: "Writing",
        blocked_reason: "old reason",
        unblock_needed: "old need",
      }),
    ).toMatchObject({ blockedReason: null, unblockNeeded: null });
    expect(parseStatusBody({ state: "blocked", working_on: "Stuck", blocked_reason: "x".repeat(1001) })).toEqual({
      ok: false,
      error: "blocked_reason must be 1000 characters or fewer",
    });
    expect(parseStatusBody({ state: "blocked", working_on: "Stuck", unblock_needed: 4 })).toEqual({
      ok: false,
      error: "unblock_needed must be a string",
    });
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
      time_label: "Blocked 5 h",
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
    expect(view.time_label).toBe("Last active just now");
    expect(statusActivitySummary("working", "Weekly priorities memo")).toBe("is working on “Weekly priorities memo”");
    expect(statusActivitySummary("blocked", "Waiting on Matt")).toBe("is blocked on “Waiting on Matt”");
    expect(statusActivitySummary("idle", "")).toBe("is idle");
    expect(statusActivitySummary("idle", "Back at 3")).toBe("is idle · “Back at 3”");
  });
});

describe("effective state", () => {
  const minute = 60 * 1000;

  function at(msAgo: number): string {
    return new Date(now.getTime() - msAgo).toISOString();
  }

  it("counts a recent write as working even when the posted state is idle", () => {
    const postedAt = at(2 * 60 * minute);
    const activeAt = at(4 * minute);
    const derived = deriveEffectiveState(
      {
        reportedState: "idle",
        reportedAt: postedAt,
        lastActive: activeAt,
        workingOn: "",
        latestActivity: "logged outreach to Ada Lovelace",
      },
      now,
    );
    expect(derived).toEqual({ state: "working", focus: "logged outreach to Ada Lovelace" });

    const [view] = presentLiveStatus(
      [{ ...agents[0], last_active: activeAt }],
      [row({ agent_id: "a", state: "idle", working_on: "", updated_at: postedAt })],
      now,
      [{ actor: "roger", summary: "logged outreach to Ada Lovelace", created_at: activeAt }],
    );
    expect(view.state).toBe("working");
    expect(view.focus_label).toBe("logged outreach to Ada Lovelace");
    expect(view.time_label).toBe("Active 4 min ago");
  });

  it("uses working_on when the posted state is working", () => {
    expect(
      deriveEffectiveState(
        {
          reportedState: "working",
          reportedAt: at(4 * minute),
          lastActive: at(4 * minute),
          workingOn: "Weekly priorities memo",
          latestActivity: "posted today’s report",
        },
        now,
      ),
    ).toEqual({ state: "working", focus: "Weekly priorities memo" });
  });

  it("says Active when a recent write has no posted focus and no activity line", () => {
    expect(
      deriveEffectiveState(
        {
          reportedState: null,
          reportedAt: null,
          lastActive: at(2 * minute),
          workingOn: "",
          latestActivity: null,
        },
        now,
      ),
    ).toEqual({ state: "working", focus: "Active" });
  });

  it("drops a working post older than 30 minutes when nothing newer arrived", () => {
    const old = at(POSTED_WORKING_MS);
    expect(
      deriveEffectiveState(
        {
          reportedState: "working",
          reportedAt: old,
          lastActive: old,
          workingOn: "Weekly priorities memo",
          latestActivity: "is working on “Weekly priorities memo”",
        },
        now,
      ),
    ).toEqual({ state: "idle", focus: "Nothing in progress" });
    expect(POSTED_WORKING_MS).toBe(30 * minute);
  });

  it("keeps a working post that is still inside 30 minutes", () => {
    const posted = at(20 * minute);
    expect(
      deriveEffectiveState(
        {
          reportedState: "working",
          reportedAt: posted,
          lastActive: posted,
          workingOn: "Weekly priorities memo",
          latestActivity: null,
        },
        now,
      ),
    ).toEqual({ state: "working", focus: "Weekly priorities memo" });
  });

  it("treats the 10 minute boundary as no longer recent", () => {
    expect(RECENT_ACTIVITY_MS).toBe(10 * minute);
    expect(
      deriveEffectiveState(
        {
          reportedState: "idle",
          reportedAt: at(3 * 60 * minute),
          lastActive: at(RECENT_ACTIVITY_MS),
          workingOn: "",
          latestActivity: "edited “Weekly priorities”",
        },
        now,
      ).state,
    ).toBe("idle");
    expect(
      deriveEffectiveState(
        {
          reportedState: "idle",
          reportedAt: at(3 * 60 * minute),
          lastActive: at(RECENT_ACTIVITY_MS - 1),
          workingOn: "",
          latestActivity: "edited “Weekly priorities”",
        },
        now,
      ).state,
    ).toBe("working");
  });

  it("does not treat an idle status post as fresh work", () => {
    const posted = at(minute);
    expect(
      deriveEffectiveState(
        {
          reportedState: "idle",
          reportedAt: posted,
          lastActive: new Date(now.getTime() - minute + 500).toISOString(),
          workingOn: "",
          latestActivity: "is idle",
        },
        now,
      ),
    ).toEqual({ state: "idle", focus: "Nothing in progress" });
  });

  it("keeps blocked until the posted state changes, and shows that age", () => {
    const blockedAt = at(90 * minute);
    const derived = deriveEffectiveState(
      {
        reportedState: "blocked",
        reportedAt: blockedAt,
        lastActive: at(minute),
        workingOn: "Waiting on Matt",
        latestActivity: "logged outreach to Ada Lovelace",
      },
      now,
    );
    expect(derived).toEqual({ state: "blocked", focus: "Waiting on Matt" });

    const [view] = presentLiveStatus(
      [{ ...agents[1], last_active: at(minute) }],
      [row({ agent_id: "b", state: "blocked", working_on: "Waiting on Matt", updated_at: blockedAt })],
      now,
      [{ actor: "chopper", summary: "logged outreach to Ada Lovelace", created_at: at(minute) }],
    );
    expect(view.state).toBe("blocked");
    expect(view.time_label).toBe("Blocked 90 min");
    expect(view.focus_label).toBe("Waiting on Matt");
  });

  it("counts the summary from the effective state", () => {
    const views = presentLiveStatus(
      [
        { ...agents[0], last_active: at(2 * minute) },
        { ...agents[1], last_active: at(3 * 60 * minute) },
      ],
      [
        row({ agent_id: "a", state: "idle", working_on: "", updated_at: at(3 * 60 * minute) }),
        row({ agent_id: "b", state: "blocked", working_on: "Waiting", updated_at: at(3 * 60 * minute) }),
      ],
      now,
    );
    expect(effectiveCounts(views)).toEqual({ working: 1, stuck: 1, napping: 0 });
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
