import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without leaking the expected value through an early length check.
 * Both sides are hashed first so timingSafeEqual always sees equal-length digests.
 * An empty expected secret never matches.
 */
export function secretMatches(input: string, secret: string): boolean {
  if (!secret) return false;
  const actual = createHash("sha256").update(input, "utf8").digest();
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(actual, expected);
}
