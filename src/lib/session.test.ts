import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SEC, signSession, verifySession } from "@/lib/session";

const secret = "test-session-secret-with-enough-length";

describe("session cookie", () => {
  it("accepts a token it just signed", async () => {
    const token = await signSession(secret, 1_700_000_000_000);
    expect(await verifySession(token, secret, 1_700_000_000_000 + 1000)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(secret);
    const [body, sig] = token.split(".");
    const flipped = `${body.slice(0, -1)}${body.endsWith("a") ? "b" : "a"}.${sig}`;
    expect(await verifySession(flipped, secret)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(secret);
    expect(await verifySession(token, "another-secret")).toBe(false);
  });

  it("rejects an expired session", async () => {
    const issuedAt = Date.now() - (SESSION_MAX_AGE_SEC + 60) * 1000;
    const token = await signSession(secret, issuedAt);
    expect(await verifySession(token, secret, Date.now())).toBe(false);
  });

  it("rejects a missing secret or a malformed token", async () => {
    const token = await signSession(secret);
    expect(await verifySession(token, "")).toBe(false);
    expect(await verifySession("not-a-token", secret)).toBe(false);
    expect(await verifySession("", secret)).toBe(false);
  });
});
