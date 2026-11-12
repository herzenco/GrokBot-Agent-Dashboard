import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/lib/types";

const roger: Agent = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "roger",
  name: "Roger",
  role: "Chief of staff",
  sort_order: 1,
  last_active: null,
};

const createTaskForAgent = vi.fn();
const presentStoredTask = vi.fn(async (task: unknown) => task);
const resolveTaskRelations = vi.fn(async () => ({}));

vi.mock("@/lib/agent-activity", () => ({ noteAgentApiCall: vi.fn(async () => undefined) }));
vi.mock("@/lib/data", () => ({
  listAgents: vi.fn(async () => [roger]),
  getAgentBySlug: vi.fn(async (slug: string) => (slug === "roger" ? roger : null)),
  findAgentByKeyHash: vi.fn(async () => null),
  listTasks: vi.fn(async () => []),
  listTasksForAgent: vi.fn(async () => []),
}));
vi.mock("@/lib/mutations", () => ({
  createTaskForAgent: (input: unknown) => createTaskForAgent(input),
}));
vi.mock("@/lib/work-db", () => ({
  presentStoredTask: (task: unknown) => presentStoredTask(task),
  presentStoredTasks: vi.fn(async (tasks: unknown) => tasks),
  resolveTaskRelations: () => resolveTaskRelations(),
}));

describe("POST /api/agent/tasks", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = "admin-test";
    createTaskForAgent.mockReset();
    createTaskForAgent.mockImplementation(async (input: { status?: string; priority?: string; blocked?: boolean; blockedNote?: string }) => ({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Ship",
      status: input.status,
      priority: input.priority,
      blocked: input.blocked,
      blocked_note: input.blockedNote,
      agent_id: roger.id,
    }));
  });

  it("accepts doing, a blocked flag, and a plain note", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/agent/tasks", {
        method: "POST",
        headers: { authorization: "Bearer admin-test", "content-type": "application/json" },
        body: JSON.stringify({
          agent: "roger",
          title: "Ship",
          status: "doing",
          priority: "normal",
          blocked: true,
          blocked_note: "Waiting on Skydeo",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(createTaskForAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "in_progress",
        priority: "medium",
        blocked: true,
        blockedNote: "Waiting on Skydeo",
      }),
    );
  });
});
