import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signResolutionBody, notifyResolutionWebhook } from "@/lib/resolution-webhook";
import {
  isPendingResolution,
  parseResolutionAck,
  resolutionAfterUnblock,
  resolutionStateOf,
  toPublicResolution,
} from "@/lib/resolutions";
import { parseTaskQuery, taskMatchesQuery, type TaskMatch } from "@/lib/work";

const payload = {
  event: "resolution.created" as const,
  task_id: "33333333-3333-4333-8333-333333333333",
  identifier: "HQ-12",
  agent: "roger",
  title: "Ship the board",
  blocked_reason: "DNS still pending",
  resolution: {
    id: "44444444-4444-4444-8444-444444444444",
    author: "herzen",
    body: "Use the sandbox key and retry the export.",
    created_at: "2026-11-13T19:05:00.000Z",
  },
};

describe("resolution state", () => {
  it("treats awaiting_agent and the pending flag as unacknowledged", () => {
    expect(isPendingResolution({ resolution_pending: true })).toBe(true);
    expect(isPendingResolution({ resolution_state: "awaiting_agent" })).toBe(true);
    expect(isPendingResolution({ resolution_state: "acknowledged", resolution_pending: false })).toBe(false);
    expect(isPendingResolution({})).toBe(false);
    expect(resolutionStateOf({ resolution_state: "acknowledged" })).toBe("acknowledged");
    expect(resolutionStateOf({ resolution_pending: true })).toBe("awaiting_agent");
  });

  it("auto-acknowledges only when a pending block is cleared", () => {
    const at = "2026-11-13T20:00:00.000Z";
    expect(resolutionAfterUnblock({ blocked: true, resolution_pending: true }, false, at)).toEqual({
      resolution_state: "acknowledged",
      resolution_pending: false,
      resolution_acknowledged_at: at,
    });
    expect(resolutionAfterUnblock({ blocked: true, resolution_state: "awaiting_agent" }, false, at)?.resolution_state).toBe(
      "acknowledged",
    );
    expect(resolutionAfterUnblock({ blocked: true, resolution_pending: true }, true, at)).toBeNull();
    expect(resolutionAfterUnblock({ blocked: true, resolution_pending: false, resolution_state: "none" }, false, at)).toBeNull();
    expect(resolutionAfterUnblock({ blocked: false, resolution_pending: true }, false, at)).toBeNull();
  });

  it("filters the task list to pending resolutions and rejects other values", () => {
    const pending = parseTaskQuery(new URLSearchParams("resolution=pending&blocked=true"));
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.query).toEqual({ resolution: "pending", blocked: true });
    const rejected = parseTaskQuery(new URLSearchParams("resolution=done"));
    expect(rejected).toEqual({ ok: false, error: "resolution must be pending" });

    const task = {
      blocked: true,
      resolution_pending: true,
      resolution_state: "awaiting_agent",
    } as TaskMatch;
    const quiet = { blocked: true, resolution_pending: false, resolution_state: "none" } as TaskMatch;
    expect(taskMatchesQuery(task, pending.query)).toBe(true);
    expect(taskMatchesQuery(quiet, pending.query)).toBe(false);
  });

  it("parses an ack body and publishes the resolution comment", () => {
    expect(parseResolutionAck({})).toEqual({ ok: true, reply: null });
    expect(parseResolutionAck({ reply: "  On it.  ", blocked: false })).toEqual({
      ok: true,
      reply: "On it.",
      blocked: false,
    });
    expect(parseResolutionAck({ blocked: "no" }).ok).toBe(false);
    expect(parseResolutionAck({ reply: "x".repeat(8001) }).ok).toBe(false);
    expect(
      toPublicResolution({
        id: "c1",
        author: "herzen",
        body: "Ship it",
        created_at: "2026-11-13T19:05:00.000Z",
      }),
    ).toEqual({
      id: "c1",
      author: "herzen",
      body: "Ship it",
      kind: "resolution",
      created_at: "2026-11-13T19:05:00.000Z",
    });
  });
});

describe("resolution webhook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESOLUTION_WEBHOOK_URL;
    delete process.env.RESOLUTION_WEBHOOK_SECRET;
  });

  it("signs the raw JSON body with HMAC-SHA256", () => {
    const body = JSON.stringify(payload);
    const expected = createHmac("sha256", "shh").update(body, "utf8").digest("hex");
    expect(signResolutionBody(body, "shh")).toBe(expected);
  });

  it("does nothing unless both the url and the secret are set", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyResolutionWebhook(payload)).toBe(false);
    process.env.RESOLUTION_WEBHOOK_URL = "https://hooks.example/resolutions";
    expect(await notifyResolutionWebhook(payload)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.RESOLUTION_WEBHOOK_SECRET = "shh";
    expect(await notifyResolutionWebhook(payload)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example/resolutions");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(payload));
    const headers = init.headers as Record<string, string>;
    expect(headers["x-resolution-signature"]).toBe(`sha256=${signResolutionBody(JSON.stringify(payload), "shh")}`);
  });
});

describe("task resolutions migration", () => {
  const sql = readFileSync("supabase/migrations/20261113150000_task_resolutions.sql", "utf8").toLowerCase();

  it("is additive and keeps row level security closed", () => {
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toMatch(/drop\s+table/);
    expect(sql).not.toMatch(/delete\s+from/);
    expect(sql).toContain("resolution_state");
    expect(sql).toContain("resolution_pending");
    expect(sql).toContain("latest_resolution_at");
    expect(sql).toContain("resolution_acknowledged_at");
    expect(sql).toContain("'resolution'");
    expect(sql).toContain("resolution_acknowledged");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.task_comments from anon");
    expect(sql).toContain("revoke all on public.task_comments from authenticated");
    expect(sql).toContain("revoke all on public.tasks from anon");
    expect(sql).toContain("revoke all on public.task_block_events from authenticated");
  });
});
