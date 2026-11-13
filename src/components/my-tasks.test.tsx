import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MyTasks } from "@/components/my-tasks";
import { selectMyTasks, type MyTaskSource } from "@/lib/my-tasks";

const today = "2026-11-13";

function task(partial: Partial<MyTaskSource> & Pick<MyTaskSource, "id">): MyTaskSource {
  return {
    title: "Ship the board",
    status: "in_progress",
    priority: "high",
    blocked: true,
    blocked_reason: "DNS still pending",
    waiting_on: "Herzen Cortes",
    assignee_herzen: true,
    due_on: "2026-11-01",
    agent_id: "agent-roger",
    project_name: "Agent HQ",
    identifier: "HQ-12",
    ...partial,
  };
}

describe("My tasks view", () => {
  it("links each open task to its detail page and shows the fields Herzen needs", () => {
    const selection = selectMyTasks(
      [task({ id: "1" }), task({ id: "2", identifier: "HQ-4", title: "Answer payroll", agent_id: "agent-hondo", assignee_herzen: false, priority: "low", due_on: "2026-11-20", project_name: "Payroll" })],
      [
        { id: "agent-roger", name: "Roger", sort_order: 1 },
        { id: "agent-hondo", name: "Hondo", sort_order: 2 },
      ],
      today,
    );
    const html = renderToStaticMarkup(<MyTasks selection={selection} />);
    expect(html).toContain("2 open tasks · 1 overdue");
    expect(html).toContain("Roger");
    expect(html).toContain("Hondo");
    expect(html).toContain('href="/work/HQ-12"');
    expect(html).toContain('href="/work/HQ-4"');
    expect(html).toContain("Ship the board");
    expect(html).toContain("In progress");
    expect(html).toContain("High");
    expect(html).toContain("Agent HQ");
    expect(html).toContain("Payroll");
    expect(html).toContain("Blocked: DNS still pending");
    expect(html).toContain("Waiting on you");
    expect(html).toContain("Assigned to you");
    expect(html).toContain("Overdue");
    expect(html).toContain("my-task-overdue");
  });

  it("shows an empty state when nothing is open", () => {
    const html = renderToStaticMarkup(
      <MyTasks selection={{ count: 0, overdue: 0, summary: "No open tasks", groups: [] }} />,
    );
    expect(html).toContain("No open tasks");
    expect(html).toContain("No open tasks are assigned to you or waiting on you.");
  });
});
