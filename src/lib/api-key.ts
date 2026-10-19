import { createHash, timingSafeEqual } from "node:crypto";
import { secretMatches } from "@/lib/password";

export type AgentIdentity = {
  id: string;
  slug: string;
  name: string;
  api_key_hash: string;
};

export type BearerActor =
  | { admin: true; agent: null }
  | { admin: false; agent: AgentIdentity };

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function apiKeyMatchesHash(token: string, storedHash: string): boolean {
  const computed = hashApiKey(token);
  const stored = storedHash.trim().toLowerCase();
  const actual = Buffer.from(computed, "utf8");
  const expected = Buffer.from(stored, "utf8");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isAdminKey(token: string, adminKey: string | undefined): boolean {
  if (!adminKey) return false;
  return secretMatches(token, adminKey);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Resolve an Authorization header to an admin actor or an agent.
 * Returns null when the header is missing or the key is unknown.
 */
export async function resolveBearer(
  header: string | null,
  adminKey: string | undefined,
  findByHash: (hash: string) => Promise<AgentIdentity | null>,
): Promise<BearerActor | null> {
  const token = bearerToken(header);
  if (!token) return null;
  if (isAdminKey(token, adminKey)) return { admin: true, agent: null };
  const agent = await findByHash(hashApiKey(token));
  if (!agent || !apiKeyMatchesHash(token, agent.api_key_hash)) return null;
  return { admin: false, agent };
}
