import { describe, expect, it } from "vitest";
import {
  BLOCK_REVIEW_FALLBACK,
  collectBlockedEntries,
  resolveBlockedDetails,
} from "@/lib/blocked";
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
      whatBlocked: "Ship memo — Needs legal sign-off before it goes out",
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
  });
});
