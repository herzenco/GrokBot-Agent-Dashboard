import { describe, expect, it } from "vitest";
import {
  BLOCK_REVIEW_FALLBACK,
  NOT_PROVIDED,
  blockedDetailFields,
  collectBlockedEntries,
  reportBlockedEntry,
  resolveBlockedDetails,
  taskBlockedEntry,
} from "@/lib/blocked";
import { parseReportBlocked, readReportBlocked } from "@/lib/blocked-payload";
import type { Task } from "@/lib/types";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    details: null,
    agent_id: "chopper",
    priority: "normal",
    status: "todo",
    blocked: true,
    blocked_note: null,
    created_at: "2026-10-23T12:00:00.000Z",
    updated_at: "2026-10-23T12:00:00.000Z",
    done_at: null,
    ...partial,
  };
}

describe("resolveBlockedDetails", () => {
  it("splits a report line that is waiting on someone", () => {
    expect(
      resolveBlockedDetails("herzenco-audits PRs #10, #11, #12 waiting on Herzen's review and merge approval"),
    ).toEqual({
      whatBlocked: "herzenco-audits PRs #10, #11, #12",
      whyBlocked: "Waiting on Herzen's review and merge approval",
      unblockNeeded: "Herzen's review and merge approval",
    });
  });

  it("splits a colon report into the failure and the reconnect step", () => {
    expect(
      resolveBlockedDetails("iCloud Mail unreadable since ~Oct 8: connector/IMAP times out, needs reconnecting"),
    ).toEqual({
      whatBlocked: "iCloud Mail unreadable since ~Oct 8",
      whyBlocked: "Connector/IMAP times out",
      unblockNeeded: "Reconnect iCloud Mail connector / IMAP",
    });
  });

  it("reads an on-hold report as a confirmation request", () => {
    expect(resolveBlockedDetails("Payroll export on hold per Herzen until Monday")).toEqual({
      whatBlocked: "Payroll export",
      whyBlocked: "On hold per Herzen until Monday",
      unblockNeeded: "Confirmation from Herzen until Monday",
    });
  });

  it("uses explicit task fields and keeps the title plus details", () => {
    expect(
      resolveBlockedDetails({
        title: "Ship memo",
        details: "Needs legal sign-off before it goes out",
        blocked_note: "waiting on someone else",
        blocked_reason: "Counsel has not replied",
        unblock_needed: "Reply from counsel",
      }),
    ).toEqual({
      whatBlocked: "Ship memo: Needs legal sign-off before it goes out",
      whyBlocked: "Counsel has not replied",
      unblockNeeded: "Reply from counsel",
    });
  });

  it("parses a task note on a dash or semicolon and infers the next step", () => {
    expect(
      resolveBlockedDetails({
        title: "Rotate the key",
        blocked_note: "API is down; waiting on Herzen to rotate the key",
      }),
    ).toEqual({
      whatBlocked: "Rotate the key",
      whyBlocked: "API is down",
      unblockNeeded: "Herzen to rotate the key",
    });
    expect(
      resolveBlockedDetails({
        title: "Mail connector",
        blocked_note: "Connector times out — needs reconnecting",
      }).unblockNeeded,
    ).toBe("Reconnect");
  });

  it("falls back when a task note has no next step", () => {
    expect(
      resolveBlockedDetails({
        title: "Fix deploy",
        blocked_note: "The build failed overnight",
      }),
    ).toEqual({
      whatBlocked: "Fix deploy",
      whyBlocked: "The build failed overnight",
      unblockNeeded: BLOCK_REVIEW_FALLBACK,
    });
  });

  it("reads a live status from working_on, with an explicit reason when posted", () => {
    expect(resolveBlockedDetails({ working_on: "Waiting on Matt" })).toEqual({
      whatBlocked: "Waiting on Matt",
      whyBlocked: "Waiting on Matt",
      unblockNeeded: "Matt",
    });
    expect(
      resolveBlockedDetails({
        working_on: "iCloud mail",
        blocked_reason: "IMAP times out",
        unblock_needed: "Reconnect the connector",
      }),
    ).toEqual({
      whatBlocked: "iCloud mail",
      whyBlocked: "IMAP times out",
      unblockNeeded: "Reconnect the connector",
    });
  });

  it("accepts a report object and a blank string", () => {
    expect(resolveBlockedDetails({ text: "Deploy awaiting staging credentials" }).unblockNeeded).toBe(
      "Staging credentials",
    );
    expect(resolveBlockedDetails("   ").unblockNeeded).toBe(BLOCK_REVIEW_FALLBACK);
  });
});

describe("collectBlockedEntries", () => {
  it("lists a stuck agent and open blocked tasks, and skips done work", () => {
    const entries = collectBlockedEntries({
      agents: [{ id: "chopper", name: "Chopper", slug: "chopper", role: "Herzen Co." }],
      tasks: [
        task({ id: "open", title: "Ship memo", blocked_note: "Waiting on Matt" }),
        task({ id: "finished", title: "Old", status: "done", blocked_note: "Was stuck" }),
        task({ id: "clear", title: "Fine", blocked: false }),
      ],
      live: [{ agent_id: "chopper", state: "blocked", working_on: "Waiting on Matt" }],
      moods: new Map([["chopper", "blocked"]]),
    });
    expect(entries.map((entry) => entry.kicker)).toEqual(["Live status", "Task"]);
    expect(entries[1]?.whatBlocked).toBe("Ship memo");
    expect(entries[1]?.unblockNeeded).toBe("Matt");
    expect(entries[1]?.task?.id).toBe("open");
    expect(entries[1]?.waitingOn).toBe("Matt");
    expect(entries[1]?.reportedAt).toBe("2026-10-23T12:00:00.000Z");
  });
});

const chopper = { id: "chopper", name: "Chopper", slug: "chopper", role: "Herzen Co." };

describe("parseReportBlocked", () => {
  it("accepts a plain string and a structured object in one array", () => {
    expect(
      parseReportBlocked([
        "  Payroll export on hold per Herzen  ",
        {
          title: " herzenco-audits PRs ",
          reason: " Review pending ",
          waiting_on: " Herzen ",
          source_url: "https://github.com/herzen-co/audits/pull/10",
          source_label: " PR 10 ",
        },
      ]),
    ).toEqual({
      ok: true,
      items: [
        "Payroll export on hold per Herzen",
        {
          title: "herzenco-audits PRs",
          reason: "Review pending",
          waiting_on: "Herzen",
          source_url: "https://github.com/herzen-co/audits/pull/10",
          source_label: "PR 10",
        },
      ],
    });
  });

  it("accepts an object that omits optional fields", () => {
    expect(parseReportBlocked([{ title: "Ship memo" }])).toEqual({
      ok: true,
      items: [
        {
          title: "Ship memo",
          reason: null,
          waiting_on: null,
          source_url: null,
          source_label: null,
        },
      ],
    });
  });

  it("rejects a blank string, a missing title, a long reason, and a non-http source", () => {
    expect(parseReportBlocked(["   "])).toEqual({ ok: false, error: "blocked cannot contain blank items" });
    expect(parseReportBlocked([{ reason: "Stuck" }])).toEqual({ ok: false, error: "blocked title is required" });
    expect(parseReportBlocked([{ title: "Ship memo", reason: "x".repeat(1001) }])).toEqual({
      ok: false,
      error: "blocked reason must be 1000 characters or fewer",
    });
    expect(parseReportBlocked([{ title: "Ship memo", waiting_on: "y".repeat(1001) }])).toEqual({
      ok: false,
      error: "blocked waiting_on must be 1000 characters or fewer",
    });
    expect(parseReportBlocked([{ title: "Ship memo", source_url: "javascript:alert(1)" }])).toEqual({
      ok: false,
      error: "blocked source_url must be http or https",
    });
    expect(parseReportBlocked("not-an-array")).toEqual({
      ok: false,
      error: "blocked must be an array of strings or objects",
    });
    expect(parseReportBlocked([12])).toEqual({ ok: false, error: "blocked items must be strings or objects" });
  });

  it("keeps stored strings and objects visible when reading a report", () => {
    expect(
      readReportBlocked([
        "Plain line",
        { title: "Audit PR", waiting_on: "Herzen", source_url: "https://linear.app/herzen/issue/HQ-4" },
        { nope: true },
      ]),
    ).toEqual([
      "Plain line",
      {
        title: "Audit PR",
        reason: null,
        waiting_on: "Herzen",
        source_url: "https://linear.app/herzen/issue/HQ-4",
        source_label: null,
      },
      {
        title: "Blocked item",
        reason: null,
        waiting_on: null,
        source_url: null,
        source_label: null,
      },
    ]);
  });
});

describe("blocked detail mapping", () => {
  it("maps a structured report item and leaves missing fields as Not provided", () => {
    const entry = reportBlockedEntry({
      agent: chopper,
      mood: "blocked",
      reportDate: "2026-11-12",
      postedAt: "2026-11-12T14:00:00.000Z",
      index: 0,
      item: {
        title: "Audit PR",
        reason: null,
        waiting_on: "Herzen",
        source_url: "https://github.com/herzen-co/audits/pull/10",
        source_label: null,
      },
    });
    expect(blockedDetailFields(entry)).toEqual({
      agent: "Chopper",
      item: "Audit PR",
      reason: NOT_PROVIDED,
      waitingOn: "Herzen",
      reportedAt: "Nov 12, 2026, 9:00 AM (America/Cancun)",
      sourceHref: "https://github.com/herzen-co/audits/pull/10",
      sourceLabel: "GitHub PR",
      unblockNeeded: "Herzen",
    });
  });

  it("keeps a plain string clickable and links the report when no source url was posted", () => {
    const entry = reportBlockedEntry({
      agent: chopper,
      mood: "blocked",
      reportDate: "2026-11-12",
      postedAt: null,
      index: 1,
      item: "Payroll export",
    });
    expect(blockedDetailFields(entry)).toMatchObject({
      agent: "Chopper",
      item: "Payroll export",
      reason: NOT_PROVIDED,
      waitingOn: NOT_PROVIDED,
      reportedAt: NOT_PROVIDED,
      sourceHref: "/reports?date=2026-11-12",
      sourceLabel: "Daily report",
    });
  });

  it("reads waiting on from a string and prefers an explicit task source", () => {
    const waiting = reportBlockedEntry({
      agent: chopper,
      mood: "blocked",
      reportDate: "2026-11-12",
      postedAt: "2026-11-12T15:30:00.000Z",
      index: 2,
      item: "herzenco-audits PRs #10 waiting on Herzen's review",
    });
    expect(blockedDetailFields(waiting).waitingOn).toBe("Herzen's review");
    expect(blockedDetailFields(waiting).reportedAt).toBe("Nov 12, 2026, 10:30 AM (America/Cancun)");

    const taskEntry = taskBlockedEntry(
      chopper,
      task({
        id: "open",
        title: "Ship memo",
        blocked_reason: "Counsel has not replied",
        unblock_needed: "Reply from counsel",
        waiting_on: "Herzen",
        source_url: "https://linear.app/herzen/issue/HQ-9",
        updated_at: "2026-11-12T16:00:00.000Z",
      }),
      "blocked",
    );
    expect(taskEntry && blockedDetailFields(taskEntry)).toMatchObject({
      item: "Ship memo",
      reason: "Counsel has not replied",
      waitingOn: "Herzen",
      reportedAt: "Nov 12, 2026, 11:00 AM (America/Cancun)",
      sourceHref: "https://linear.app/herzen/issue/HQ-9",
      sourceLabel: "Linear issue",
    });
  });

  it("maps unblock_needed onto waiting on when waiting_on was not posted", () => {
    const entry = taskBlockedEntry(
      chopper,
      task({
        id: "open",
        title: "Rotate the key",
        blocked_note: "The API is down",
        unblock_needed: "Herzen to rotate the key",
        updated_at: "2026-11-12T16:00:00.000Z",
      }),
      "blocked",
    );
    expect(entry && blockedDetailFields(entry).waitingOn).toBe("Herzen to rotate the key");
    expect(entry && blockedDetailFields(entry).sourceLabel).toBe(NOT_PROVIDED);
  });
});
