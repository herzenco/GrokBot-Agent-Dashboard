import { describe, expect, it } from "vitest";
import {
  apiKeyMatchesHash,
  bearerToken,
  hashApiKey,
  isAdminKey,
  resolveBearer,
  type AgentIdentity,
} from "@/lib/api-key";

const agentToken = "ahq_agent_token_for_roger";
const adminToken = "ahq_admin_token_value";
const agent: AgentIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "roger",
  name: "Roger",
  api_key_hash: hashApiKey(agentToken),
};

describe("agent API key verification", () => {
  it("hashes a token the same way every time", () => {
    expect(hashApiKey(agentToken)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(agentToken)).toBe(hashApiKey(agentToken));
  });

  it("matches a token to its stored hash and rejects others", () => {
    expect(apiKeyMatchesHash(agentToken, agent.api_key_hash)).toBe(true);
    expect(apiKeyMatchesHash(agentToken, agent.api_key_hash.toUpperCase())).toBe(true);
    expect(apiKeyMatchesHash("different-token", agent.api_key_hash)).toBe(false);
    expect(apiKeyMatchesHash(agentToken, "abcd")).toBe(false);
    expect(apiKeyMatchesHash(agentToken, "")).toBe(false);
  });

  it("recognizes the admin key without treating it as an agent hash", () => {
    expect(isAdminKey(adminToken, adminToken)).toBe(true);
    expect(isAdminKey(agentToken, adminToken)).toBe(false);
    expect(isAdminKey(adminToken, undefined)).toBe(false);
    expect(isAdminKey(adminToken, "")).toBe(false);
  });

  it("parses a bearer token", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Bearer abc ")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("resolves an agent key, an admin key, and unknown keys", async () => {
    const lookups: string[] = [];
    const findByHash = async (hash: string) => {
      lookups.push(hash);
      return hash === agent.api_key_hash ? agent : null;
    };

    expect(await resolveBearer(`Bearer ${agentToken}`, adminToken, findByHash)).toEqual({
      admin: false,
      agent,
    });
    expect(lookups).toEqual([hashApiKey(agentToken)]);

    const findUnused = async () => {
      throw new Error("admin key should not hit the agent table");
    };
    expect(await resolveBearer(`Bearer ${adminToken}`, adminToken, findUnused)).toEqual({
      admin: true,
      agent: null,
    });

    expect(await resolveBearer("Bearer nope", adminToken, findByHash)).toBeNull();
    expect(await resolveBearer(null, adminToken, findByHash)).toBeNull();
    expect(await resolveBearer("Bearer abc", undefined, findByHash)).toBeNull();
  });
});
