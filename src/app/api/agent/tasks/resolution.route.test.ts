import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiKey } from "@/lib/api-key";
import type { Agent, Task } from "@/lib/types";

const roger: Agent = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "roger",
  name: "Roger",
  role: "Chief of staff",
  sort_order: 1,
  last_active: null,
};

const hondo: Agent = {
  id: "55555555-5555-4555-8555-555555555555",
  slug: "hondo",
  name: "Hondo",
  role: "Outbound",
  sort_order: 2,
  last_active: null,
};

const rogerHash = hashApiKey("roger-key");

function task(partial: Partial<Task> & Pick<Task, "id" | "agent_id" | "identifier">): Task {
  return {
    title: partial.identifier === "HQ-4" ? "Answer payroll" : "Ship the board",
    details: null,
    priority: "high",
    status: "in_progress",
    blocked: true,
    blocked_note: "DNS still pending",
    blocked_reason: "DNS still pending",
    waiting_on: "Herzen",
    resolution_state: "awaiting_agent",
    resolution_pending: true,
    latest_resolution_at: "2026-11-13T19:05:00.000Z",
    created_at: "2026-11-13T18:00:00.000Z",
    updated_at: "2026-11-13T19:05:00.000Z",
    done_at: null,
    ...partial,
  };
}

const rogerTask = task({ id: "33333333-3333-4333-8333-333333333333", agent_id: roger.id, identifier: "HQ-12" });
const hondoTask = task({ id: "66666666-6666-4666-8666-666666666666", agent_id: hondo.id, identifier: "HQ-4" });
const quietTask = task({
  id: "77777777-7777-4777-8777-777777777777",
  agent_id: roger.id,
  identifier: "HQ-13",
  title: "Already moving",
  resolution_pending: false,
  resolution_state: "none",
  blocked: false,
  blocked_note: null,
  blocked_reason: null,
});

const listTasks = vi.fn(async () => [rogerTask, hondoTask, quietTask]);
const listTasksForAgent = vi.fn(async (agentId: string) =>
  [rogerTask, hondoTask, quietTask].filter((item) => item.agent_id === agentId),
);
const findAgentByKeyHash = vi.fn(async (hash: string) =>
  hash === rogerHash ? { ...roger, api_key_hash: rogerHash } : null,
);
const acknowledgeResolution = vi.fn();
const applyTaskPatch = vi.fn();
const addComment = vi.fn();
const findTaskByKey = vi.fn();
const presentStoredTask = vi.fn(async (item: Task) => ({ ...item, agent: item.agent_id === hondo.id ? "hondo" : "roger" }));

vi.mock("@/lib/agent-activity", () => ({ noteAgentApiCall: vi.fn(async () => undefined) }));
vi.mock("@/lib/data", () => ({
  listAgents: vi.fn(async () => [roger, hondo]),
  listTasks: () => listTasks(),
  listTasksForAgent: (agentId: string) => listTasksForAgent(agentId),
  findAgentByKeyHash: (hash: string) => findAgentByKeyHash(hash),
  getAgentBySlug: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock("@/lib/work-db", () => ({
  presentStoredTasks: async (tasks: Task[]) =>
    tasks.map((item) => ({ ...item, agent: item.agent_id === hondo.id ? "hondo" : "roger" })),
  presentStoredTask: (item: Task) => presentStoredTask(item),
  attachPendingResolutions: async (tasks: Task[]) =>
    tasks.map((item) => ({
      ...item,
      pending_resolution: {
        id: `res-${item.id}`,
        task_id: item.id,
        author: "herzen",
        body: `Resolution for ${item.identifier}`,
        kind: "resolution",
        created_at: "2026-11-13T19:05:00.000Z",
        updated_at: "2026-11-13T19:05:00.000Z",
      },
    })),
  findTaskByKey: (key: string) => findTaskByKey(key),
  acknowledgeResolution: (...args: unknown[]) => acknowledgeResolution(...args),
  addComment: (...args: unknown[]) => addComment(...args),
  resolveTaskRelations: vi.fn(),
}));
vi.mock("@/lib/mutations", () => ({
  applyTaskPatch: (...args: unknown[]) => applyTaskPatch(...args),
  createTaskForAgent: vi.fn(),
}));

function authed(token: string, path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("pending resolution API", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = "admin-test";
    listTasks.mockClear();
    listTasksForAgent.mockClear();
    acknowledgeResolution.mockReset();
    applyTaskPatch.mockReset();
    addComment.mockReset();
    findTaskByKey.mockReset();
  });

  it("returns only unacknowledged resolutions, including the text, for an admin", async () => {
    const { GET } = await import("./route");
    const response = await GET(authed("admin-test", "/api/agent/tasks?resolution=pending"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tasks: { identifier: string; pending_resolution: { author: string; body: string } }[] };
    expect(body.tasks.map((item) => item.identifier).sort()).toEqual(["HQ-12", "HQ-4"]);
    expect(body.tasks.every((item) => item.pending_resolution.author === "herzen")).toBe(true);
    expect(body.tasks.find((item) => item.identifier === "HQ-12")?.pending_resolution.body).toBe("Resolution for HQ-12");
    expect(body.tasks.find((item) => item.identifier === "HQ-12")).toMatchObject({
      blocked_reason: "DNS still pending",
    });
  });

  it("scopes an agent key to that agent's pending resolutions", async () => {
    const { GET } = await import("./route");
    const response = await GET(authed("roger-key", "/api/agent/tasks?resolution=pending"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { agent: string; tasks: { identifier: string }[] };
    expect(body.agent).toBe("roger");
    expect(body.tasks.map((item) => item.identifier)).toEqual(["HQ-12"]);
    expect(listTasks).not.toHaveBeenCalled();
    expect(listTasksForAgent).toHaveBeenCalledWith(roger.id);

    const denied = await GET(authed("roger-key", "/api/agent/tasks?resolution=pending&agent=hondo"));
    expect(denied.status).toBe(403);
  });

  it("rejects a bad resolution filter and a missing key", async () => {
    const { GET } = await import("./route");
    const bad = await GET(authed("admin-test", "/api/agent/tasks?resolution=closed"));
    expect(bad.status).toBe(400);
    const open = await GET(new Request("http://localhost/api/agent/tasks?resolution=pending"));
    expect(open.status).toBe(401);
  });

  it("lists the same pending rows from /api/agent/resolutions", async () => {
    const { GET } = await import("../resolutions/route");
    const response = await GET(authed("roger-key", "/api/agent/resolutions"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      resolutions: { identifier: string; blocked_reason: string; resolution: { body: string; author: string; created_at: string } }[];
    };
    expect(body.resolutions).toEqual([
      expect.objectContaining({
        task_id: rogerTask.id,
        identifier: "HQ-12",
        blocked_reason: "DNS still pending",
        resolution: expect.objectContaining({
          author: "herzen",
          body: "Resolution for HQ-12",
          created_at: "2026-11-13T19:05:00.000Z",
        }),
      }),
    ]);

    const admin = await GET(authed("admin-test", "/api/agent/resolutions"));
    const adminBody = (await admin.json()) as { resolutions: { identifier: string }[] };
    expect(adminBody.resolutions.map((item) => item.identifier).sort()).toEqual(["HQ-12", "HQ-4"]);
  });

  it("acknowledges a resolution for the owning agent and hides another agent's task", async () => {
    findTaskByKey.mockImplementation(async (key: string) => {
      if (key === rogerTask.id || key === "HQ-12") return rogerTask;
      if (key === hondoTask.id || key === "HQ-4") return hondoTask;
      return null;
    });
    acknowledgeResolution.mockImplementation(async (item: Task) => ({
      task: { ...item, resolution_pending: false, resolution_state: "acknowledged" },
    }));

    const { POST } = await import("./[id]/resolution/ack/route");
    const denied = await POST(authed("roger-key", `/api/agent/tasks/${hondoTask.id}/resolution/ack`, { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: hondoTask.id }),
    });
    expect(denied.status).toBe(404);
    expect(acknowledgeResolution).not.toHaveBeenCalled();

    const response = await POST(authed("roger-key", "/api/agent/tasks/HQ-12/resolution/ack", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "HQ-12" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { acknowledged: boolean; identifier: string; resolution_state: string };
    expect(body.acknowledged).toBe(true);
    expect(body.identifier).toBe("HQ-12");
    expect(body.resolution_state).toBe("acknowledged");
    expect(acknowledgeResolution).toHaveBeenCalledTimes(1);
  });

  it("acks by unblocking in the same call, with a reply, and does not ack twice", async () => {
    findTaskByKey.mockResolvedValue(rogerTask);
    applyTaskPatch.mockResolvedValue({
      task: { ...rogerTask, blocked: false, resolution_pending: false, resolution_state: "acknowledged", status: "in_progress" },
    });
    addComment.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      author: "roger",
      body: "Using the sandbox key.",
      kind: "comment",
      created_at: "2026-11-13T20:00:00.000Z",
    });

    const { POST } = await import("./[id]/resolution/ack/route");
    const response = await POST(
      authed("roger-key", "/api/agent/tasks/HQ-12/resolution/ack", {
        method: "POST",
        body: JSON.stringify({ reply: "Using the sandbox key.", blocked: false, status: "in_progress" }),
      }),
      { params: Promise.resolve({ id: "HQ-12" }) },
    );
    expect(response.status).toBe(200);
    expect(applyTaskPatch).toHaveBeenCalledWith(
      rogerTask.id,
      { blocked: false, status: "in_progress" },
      "roger",
    );
    expect(acknowledgeResolution).not.toHaveBeenCalled();
    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        author: "roger",
        body: "Using the sandbox key.",
        task: expect.objectContaining({ resolution_pending: false }),
      }),
    );
    const body = (await response.json()) as { acknowledged: boolean; reply: { body: string } };
    expect(body.acknowledged).toBe(true);
    expect(body.reply.body).toBe("Using the sandbox key.");
  });

  it("lets the admin key acknowledge any agent's resolution", async () => {
    findTaskByKey.mockResolvedValue(hondoTask);
    acknowledgeResolution.mockImplementation(async (item: Task) => ({
      task: { ...item, resolution_pending: false, resolution_state: "acknowledged" },
    }));
    const { POST } = await import("./[id]/resolution/ack/route");
    const response = await POST(authed("admin-test", `/api/agent/tasks/${hondoTask.id}/resolution/ack`, { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: hondoTask.id }),
    });
    expect(response.status).toBe(200);
    expect(acknowledgeResolution).toHaveBeenCalledWith(hondoTask, "hondo");
  });
});
