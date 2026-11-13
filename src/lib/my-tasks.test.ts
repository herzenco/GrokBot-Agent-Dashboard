import { describe, expect, it } from "vitest";
import { formatIsoWeekday } from "@/lib/time";
import {
  isHerzenOpenTask,
  myTaskSummary,
  selectMyTasks,
  waitingOnHerzen,
  type MyTaskAgentRef,
  type MyTaskSource,
} from "@/lib/my-tasks";

const today = "2026-11-13";
const roger: MyTaskAgentRef = { id: "agent-roger", name: "Roger", sort_order: 1 };
const hondo: MyTaskAgentRef = { id: "agent-hondo", name: "Hondo", sort_order: 2 };

function task(partial: Partial<MyTaskSource> & Pick<MyTaskSource, "id">): MyTaskSource {
  return {
    title: partial.title ?? partial.id,
    status: "todo",
    priority: "medium",
    blocked: false,
    assignee_herzen: false,
    agent_id: roger.id,
    ...partial,
  };
}

describe("waiting on Herzen", () => {
  it("matches Herzen by name, case, and surrounding words", () => {
    expect(waitingOnHerzen("herzen")).toBe(true);
    expect(waitingOnHerzen("Herzen")).toBe(true);
    expect(waitingOnHerzen("HERZEN")).toBe(true);
    expect(waitingOnHerzen("  Herzen Cortes  ")).toBe(true);
    expect(waitingOnHerzen("Needs a review from Herzen.")).toBe(true);
    expect(waitingOnHerzen("Herzen's approval")).toBe(true);
    expect(waitingOnHerzen("Tito")).toBe(true);
    expect(waitingOnHerzen("tito")).toBe(true);
  });

  it("ignores blank values and names that only look similar", () => {
    expect(waitingOnHerzen(null)).toBe(false);
    expect(waitingOnHerzen("   ")).toBe(false);
    expect(waitingOnHerzen("Sam")).toBe(false);
    expect(waitingOnHerzen("herzegovina")).toBe(false);
    expect(waitingOnHerzen("Ask Tito tomorrow")).toBe(false);
  });
});

describe("Herzen's open tasks", () => {
  it("keeps open tasks assigned to Herzen or blocked waiting on Herzen, once", () => {
    const assigned = task({ id: "assigned", assignee_herzen: true, status: "in_progress" });
    const waiting = task({
      id: "waiting",
      blocked: true,
      waiting_on: "Herzen Cortes",
      blocked_reason: "Review pending",
      agent_id: hondo.id,
    });
    const both = task({
      id: "both",
      assignee_herzen: true,
      blocked: true,
      waiting_on: "herzen",
      status: "doing",
    });
    const rows = [
      assigned,
      waiting,
      both,
      both,
      task({ id: "done", assignee_herzen: true, status: "done" }),
      task({ id: "canceled", assignee_herzen: true, status: "canceled" }),
      task({ id: "cancelled", blocked: true, waiting_on: "Herzen", status: "cancelled" }),
      task({ id: "other", blocked: true, waiting_on: "Sam" }),
      task({ id: "unblocked", blocked: false, waiting_on: "Herzen" }),
      task({ id: "empty-wait", blocked: true, waiting_on: "  " }),
      task({ id: "backlog", assignee_herzen: true, status: "backlog" }),
    ];

    expect(isHerzenOpenTask(assigned)).toBe(true);
    expect(isHerzenOpenTask(rows.find((row) => row.id === "done")!)).toBe(false);
    expect(isHerzenOpenTask(rows.find((row) => row.id === "unblocked")!)).toBe(false);

    const selected = selectMyTasks(rows, [roger, hondo], today);
    expect(selected.groups.flatMap((group) => group.tasks.map((item) => item.id))).toEqual([
      "assigned",
      "backlog",
      "both",
      "waiting",
    ]);
    expect(selected.count).toBe(4);
    expect(selected.summary).toBe("4 open tasks");

    const combined = selected.groups.flatMap((group) => group.tasks).find((item) => item.id === "both");
    expect(combined?.assigned).toBe(true);
    expect(combined?.waiting).toBe(true);
    expect(combined?.statusLabel).toBe("In progress");
  });

  it("sorts overdue first, then due date, then priority, and groups by agent", () => {
    const rows = [
      task({ id: "future-low", identifier: "HQ-1", due_on: "2026-11-20", priority: "low", assignee_herzen: true }),
      task({
        id: "overdue-low",
        identifier: "HQ-2",
        due_on: "2026-11-10",
        priority: "low",
        assignee_herzen: true,
        agent_id: hondo.id,
      }),
      task({
        id: "overdue-urgent",
        identifier: "HQ-3",
        due_on: "2026-11-01",
        priority: "urgent",
        assignee_herzen: true,
      }),
      task({
        id: "same-day-high",
        identifier: "HQ-4",
        due_on: "2026-11-20",
        priority: "high",
        assignee_herzen: true,
      }),
      task({ id: "undated-urgent", identifier: "HQ-5", priority: "urgent", assignee_herzen: true }),
      task({ id: "undated-normal", identifier: "HQ-6", priority: "normal", assignee_herzen: true, agent_id: hondo.id }),
      task({
        id: "due-today",
        identifier: "HQ-7",
        due_on: "2026-11-13",
        priority: "medium",
        assignee_herzen: true,
        agent_id: hondo.id,
      }),
    ];

    const selected = selectMyTasks(rows, [roger, hondo], today);
    expect(selected.groups.map((group) => [group.agentName, group.tasks.map((item) => item.id)])).toEqual([
      ["Roger", ["overdue-urgent", "same-day-high", "future-low", "undated-urgent"]],
      ["Hondo", ["overdue-low", "due-today", "undated-normal"]],
    ]);
    expect(selected.overdue).toBe(2);
    expect(selected.summary).toBe("7 open tasks · 2 overdue");

    const oldest = selected.groups[0].tasks[0];
    expect(oldest.overdue).toBe(true);
    expect(oldest.dueOn).toBe("2026-11-01");
    expect(oldest.dueLabel).toBe(formatIsoWeekday("2026-11-01"));
    expect(oldest.href).toBe("/work/HQ-3");
    expect(oldest.priority).toBe("urgent");
    expect(selected.groups[1].tasks[1].overdue).toBe(false);
    expect(selected.groups[1].tasks[1].dueLabel).toBe(formatIsoWeekday("2026-11-13"));
    expect(selected.groups[1].tasks[2].priorityLabel).toBe("Medium");
    expect(selected.groups[1].tasks[2].dueLabel).toBeNull();
  });

  it("shows the project and the blocked reason, including a note when the reason is blank", () => {
    const selected = selectMyTasks(
      [
        task({
          id: "review",
          identifier: "HQ-9",
          assignee_herzen: true,
          blocked: true,
          waiting_on: "Herzen",
          blocked_reason: "  DNS still pending  ",
          project_id: "project-hq",
          due_on: "2026-11-20T00:00:00.000Z",
        }),
        task({
          id: "note-only",
          number: 10,
          blocked: true,
          waiting_on: "herzen",
          blocked_note: "Needs a decision",
          project_name: "  Payroll  ",
          agent_id: "missing-agent",
        }),
      ],
      [roger],
      today,
      [{ id: "project-hq", name: "Agent HQ" }],
    );

    expect(selected.groups.map((group) => group.agentName)).toEqual(["Roger", "Unknown"]);
    expect(selected.groups[0].tasks[0]).toMatchObject({
      projectName: "Agent HQ",
      blockedReason: "DNS still pending",
      dueOn: "2026-11-20",
      href: "/work/HQ-9",
    });
    expect(selected.groups[1].tasks[0]).toMatchObject({
      identifier: "HQ-10",
      href: "/work/HQ-10",
      projectName: "Payroll",
      blockedReason: "Needs a decision",
      waiting: true,
      assigned: false,
    });
  });

  it("hides a stale block note once the task is no longer blocked", () => {
    const selected = selectMyTasks(
      [
        task({
          id: "clear",
          assignee_herzen: true,
          blocked: false,
          blocked_reason: "Old reason",
          blocked_note: "Old note",
        }),
      ],
      [roger],
      today,
    );
    expect(selected.groups[0].tasks[0].blockedReason).toBeNull();
    expect(selected.groups[0].tasks[0].waiting).toBe(false);
  });

  it("describes an empty list", () => {
    expect(myTaskSummary(0, 0)).toBe("No open tasks");
    expect(myTaskSummary(1, 0)).toBe("1 open task");
    expect(selectMyTasks([], [roger], today)).toMatchObject({ count: 0, overdue: 0, summary: "No open tasks", groups: [] });
  });
});
