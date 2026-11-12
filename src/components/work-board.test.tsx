import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkBoard, WorkList } from "@/components/work-board";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const tasks = [
  {
    id: "1",
    identifier: "HQ-12",
    title: "Ship the board",
    status: "doing" as const,
    priority: "normal",
    blocked: true,
    agentName: "R5-D4",
    projectName: "Agent HQ",
    dueOn: "2026-11-20",
    labels: ["Launch"],
    updatedAt: "2026-11-12T15:00:00.000Z",
  },
];

describe("work views", () => {
  it("shows a doing task in the in progress column and in the list", () => {
    const board = renderToStaticMarkup(<WorkBoard tasks={tasks} />);
    expect(board).toContain("In progress");
    expect(board).toContain("HQ-12");
    expect(board).toContain("Ship the board");
    expect(board).toContain("Blocked");
    const list = renderToStaticMarkup(<WorkList tasks={tasks} />);
    expect(list).toContain("HQ-12");
    expect(list).toContain("In progress");
    expect(list).toContain("Launch");
  });
});
