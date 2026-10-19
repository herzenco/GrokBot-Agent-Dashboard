type Bucket = { failures: number[] };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const buckets = new Map<string, Bucket>();

function recent(key: string, now: number): number[] {
  const bucket = buckets.get(key) ?? { failures: [] };
  bucket.failures = bucket.failures.filter((stamp) => now - stamp < WINDOW_MS);
  buckets.set(key, bucket);
  return bucket.failures;
}

export function loginLimited(key: string, now = Date.now()): { limited: boolean; retryAfter: number } {
  const failures = recent(key, now);
  if (failures.length < MAX_FAILURES) return { limited: false, retryAfter: 0 };
  const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - failures[0])) / 1000));
  return { limited: true, retryAfter };
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  recent(key, now).push(now);
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
