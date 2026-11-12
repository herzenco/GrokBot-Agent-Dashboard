import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readReportBlocked } from "@/lib/blocked-payload";
import type { Task } from "@/lib/types";
import {
  assignIdentifiers,
  canonicalPriority,
  canonicalStatus,
  migrateLegacyTask,
  parseTaskCreate,
  parseTaskPatch,
  parseTaskQuery,
  planTaskUpdate,
  taskMatchesQuery,
} from "@/lib/work";

const id = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

function task(partial: Partial<Task> = {}): Task {
  return {
    id,
    title: "Deploy OCC",
    details: null,
    agent_id: agentId,
    priority: "normal",
    status: "doing",
    blocked: true,
    blocked_note: "DNS still pending",
    blocked_reason: "DNS still pending",
    unblock_needed: "Herzen",
    waiting_on: "Herzen",
    source_url: "https://github.com/herzen-co/occ/pull/4",
    created_at: "2026-10-19T14:00:00.000Z",
    updated_at: "2026-10-19T14:00:00.000Z",
    done_at: null,
    ...partial,
  };
}

describe("legacy task payloads", () => {
  it("maps doing to in_progress and normal to medium", () => {
    expect(canonicalStatus("doing")).toBe("in_progress");
    expect(canonicalPriority("normal")).toBe("medium");
    expect(migrateLegacyTask({ status: "doing", priority: "normal" })).toEqual({
      status: "in_progress",
      priority: "medium",
    });
  });

  it("accepts an old create payload with doing, a blocked flag, and a plain note", () => {
    const parsed = parseTaskCreate({
      title: "SAM usage export",
      status: "doing",
      priority: "normal",
      blocked: true,
      blocked_note: "Needs prod read credentials",
      source_url: "https://github.com/herzen-co/audits/pull/4",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status).toBe("in_progress");
    expect(parsed.value.priority).toBe("medium");
    expect(parsed.value.blocked).toBe(true);
    expect(parsed.value.blocked_note).toBe("Needs prod read credentials");
    expect(parsed.value.links?.[0]?.url).toBe("https://github.com/herzen-co/audits/pull/4");
  });

  it("keeps a durable link when a block clears or the task is done", () => {
    const cleared = planTaskUpdate(task(), { blocked: false }, { now: "2026-11-12T15:00:00.000Z", nextAgentName: "R5-D4" });
    expect("error" in cleared).toBe(false);
    if ("error" in cleared) return;
    expect(cleared.row.blocked).toBe(false);
    expect(cleared.row.source_url).toBeNull();
    expect(cleared.row.waiting_on).toBeNull();
    expect(cleared.promoteLink?.url).toBe("https://github.com/herzen-co/occ/pull/4");
    expect(cleared.blockEvent?.action).toBe("cleared");
    expect(cleared.blockEvent?.snapshot.waiting_on).toBe("Herzen");

    const done = planTaskUpdate(task(), { status: "doing" }, { now: "2026-11-12T15:00:00.000Z", nextAgentName: "R5-D4" });
    expect("error" in done).toBe(false);
    if ("error" in done) return;
    expect(done.row.status).toBe("in_progress");

    const finished = planTaskUpdate(task(), { status: "done" }, { now: "2026-11-12T16:00:00.000Z", nextAgentName: "R5-D4" });
    expect("error" in finished).toBe(false);
    if ("error" in finished) return;
    expect(finished.row.status).toBe("done");
    expect(finished.row.blocked).toBe(false);
    expect(finished.row.source_url).toBeNull();
    expect(finished.promoteLink?.kind).toBe("pr");
    expect(finished.blockEvent?.action).toBe("cleared");
  });

  it("still accepts a plain-string blocked report item", () => {
    expect(readReportBlocked(["Payroll export on hold per Herzen"])).toEqual(["Payroll export on hold per Herzen"]);
  });
});

describe("task queries and identifiers", () => {
  it("assigns stable HQ numbers in created_at order", () => {
    const rows = assignIdentifiers([
      { id: "b", created_at: "2026-10-19T12:00:00.000Z" },
      { id: "a", created_at: "2026-10-19T12:00:00.000Z" },
      { id: "c", created_at: "2026-10-20T12:00:00.000Z" },
    ]);
    expect(rows.map((row) => [row.id, row.identifier])).toEqual([
      ["a", "HQ-1"],
      ["b", "HQ-2"],
      ["c", "HQ-3"],
    ]);
  });

  it("filters by status, priority, label, blocked, and search", () => {
    const query = parseTaskQuery(new URLSearchParams("status=doing&priority=normal&label=Launch&blocked=true&q=hq-12"));
    expect(query.ok).toBe(true);
    if (!query.ok) return;
    const match = task(
      {
        identifier: "HQ-12",
        priority: "normal",
        status: "doing",
        blocked: true,
      },
    );
    expect(taskMatchesQuery({ ...match, labels: ["Launch"] }, query.query)).toBe(true);
    expect(taskMatchesQuery({ ...match, labels: ["Other"], blocked: false }, query.query)).toBe(false);
  });

  it("accepts external refs on a patch without dropping unrelated keys in the plan", () => {
    const current = task({
      blocked: false,
      blocked_note: null,
      blocked_reason: null,
      unblock_needed: null,
      waiting_on: null,
      source_url: null,
      external_refs: { linear_id: "ENG-4", cloud_agent_id: "bc-abc123" },
    });
    const parsed = parseTaskPatch({ linear_url: "https://linear.app/herzen/issue/ENG-4" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const planned = planTaskUpdate(
      current,
      { external_refs: parsed.value.external_refs },
      { now: "2026-11-12T15:00:00.000Z", nextAgentName: "R5-D4" },
    );
    expect("error" in planned).toBe(false);
    if ("error" in planned) return;
    expect(planned.row.external_refs).toMatchObject({
      linear_id: "ENG-4",
      linear_url: "https://linear.app/herzen/issue/ENG-4",
      cloud_agent_id: "bc-abc123",
    });
  });
});

describe("work tracking migration", () => {
  const sql = readFileSync("supabase/migrations/20261112210000_work_tracking.sql", "utf8").toLowerCase();

  it("is additive: no dropped columns, tables, or task rows", () => {
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toMatch(/drop\s+table/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.tasks/);
    expect(sql).toMatch(/update public\.tasks set status = 'in_progress' where status = 'doing'/);
    expect(sql).toMatch(/update public\.tasks set priority = 'medium' where priority = 'normal'/);
    expect(sql).toContain("task_links");
    expect(sql).toContain("task_block_events");
    expect(sql).toContain("task_comments");
    expect(sql).toContain("external_refs");
    expect(sql).toContain("hq-");
    expect(sql).toContain("enable row level security");
  });
});
