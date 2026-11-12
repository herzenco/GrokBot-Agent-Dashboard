import { beforeEach, describe, expect, it, vi } from "vitest";

const importLinearIssues = vi.fn();

vi.mock("@/lib/work-db", () => ({
  importLinearIssues: (...args: unknown[]) => importLinearIssues(...args),
}));
vi.mock("@/lib/data", () => ({
  findAgentByKeyHash: vi.fn(async () => null),
  getAgentBySlug: vi.fn(async () => null),
}));

describe("POST /api/agent/import/linear", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = "admin-test";
    importLinearIssues.mockReset();
    importLinearIssues.mockResolvedValue({ created: 1, updated: 0, unchanged: 0, tasks: [], errors: [] });
  });

  it("rejects an agent key and accepts a JSON array for the admin key", async () => {
    const { POST } = await import("./route");
    const agent = await POST(
      new Request("http://localhost/api/agent/import/linear", {
        method: "POST",
        headers: { authorization: "Bearer somebody", "content-type": "application/json" },
        body: JSON.stringify([]),
      }),
    );
    expect(agent.status).toBe(401);

    const admin = await POST(
      new Request("http://localhost/api/agent/import/linear", {
        method: "POST",
        headers: { authorization: "Bearer admin-test", "content-type": "application/json" },
        body: JSON.stringify([{ identifier: "ENG-1", title: "Parent", state: "Todo" }]),
      }),
    );
    expect(admin.status).toBe(200);
    expect(importLinearIssues).toHaveBeenCalledWith([expect.objectContaining({ identifier: "ENG-1" })]);
  });
});
