import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

const harness = vi.hoisted(() => {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const events: { action: string; detail?: string | null }[] = [];
  let current: Task | null = null;
  return {
    updates,
    events,
    setCurrent(task: Task) {
      current = task;
    },
    current() {
      return current;
    },
    reset() {
      updates.length = 0;
      events.length = 0;
    },
  };
});

vi.mock("@/lib/db", () => ({
  db: () => ({
    from(table: string) {
      const api = {
        update(payload: Record<string, unknown>) {
          harness.updates.push({ table, payload });
          return api;
        },
        insert(payload: Record<string, unknown>) {
          harness.updates.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        eq() {
          return api;
        },
        select() {
          return api;
        },
        async single() {
          const last = [...harness.updates].reverse().find((row) => row.table === table);
          return { data: { ...harness.current(), ...last?.payload }, error: null };
        },
      };
      return api;
    },
  }),
}));

vi.mock("@/lib/data", () => ({
  getTask: async () => harness.current(),
  listAgents: async () => [
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "roger",
      name: "Roger",
      role: "Chief of staff",
      sort_order: 1,
      last_active: null,
    },
  ],
}));

vi.mock("@/lib/work-db", () => ({
  insertBlockEvent: async (input: { action: string; detail?: string | null }) => {
    harness.events.push(input);
  },
  ensureTaskLink: async () => undefined,
  listParentMap: async () => new Map(),
  setTaskLabels: async () => [],
}));

function blockedTask(partial: Partial<Task> = {}): Task {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Ship the board",
    details: null,
    agent_id: "22222222-2222-4222-8222-222222222222",
    priority: "medium",
    status: "in_progress",
    blocked: true,
    blocked_note: "DNS still pending",
    blocked_reason: "DNS still pending",
    unblock_needed: "Herzen to approve the record",
    waiting_on: "Herzen",
    source_url: null,
    resolution_state: "awaiting_agent",
    resolution_pending: true,
    latest_resolution_at: "2026-11-13T19:05:00.000Z",
    resolution_acknowledged_at: null,
    created_at: "2026-11-13T18:00:00.000Z",
    updated_at: "2026-11-13T19:05:00.000Z",
    done_at: null,
    ...partial,
  };
}

describe("applyTaskPatch auto-ack", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("acknowledges a pending resolution when the block is cleared", async () => {
    harness.setCurrent(blockedTask());
    const { applyTaskPatch } = await import("@/lib/mutations");
    const result = await applyTaskPatch(blockedTask().id, { blocked: false }, "roger");
    expect("error" in result).toBe(false);
    const taskUpdate = harness.updates.find((row) => row.table === "tasks");
    expect(taskUpdate?.payload).toMatchObject({
      blocked: false,
      resolution_state: "acknowledged",
      resolution_pending: false,
    });
    expect(taskUpdate?.payload.resolution_acknowledged_at).toEqual(expect.any(String));
    expect(harness.events.map((event) => event.action)).toEqual(["cleared", "resolution_acknowledged"]);
  });

  it("acknowledges a pending resolution when the task is marked done", async () => {
    harness.setCurrent(blockedTask());
    const { applyTaskPatch } = await import("@/lib/mutations");
    const result = await applyTaskPatch(blockedTask().id, { status: "done" }, "roger");
    expect("task" in result).toBe(true);
    const taskUpdate = harness.updates.find((row) => row.table === "tasks");
    expect(taskUpdate?.payload).toMatchObject({
      status: "done",
      blocked: false,
      resolution_state: "acknowledged",
      resolution_pending: false,
    });
  });

  it("leaves resolution fields alone when the block clears with nothing pending", async () => {
    harness.setCurrent(blockedTask({ resolution_pending: false, resolution_state: "none" }));
    const { applyTaskPatch } = await import("@/lib/mutations");
    await applyTaskPatch(blockedTask().id, { blocked: false }, "roger");
    const taskUpdate = harness.updates.find((row) => row.table === "tasks");
    expect(taskUpdate?.payload).not.toHaveProperty("resolution_state");
    expect(harness.events.map((event) => event.action)).toEqual(["cleared"]);
  });
});
