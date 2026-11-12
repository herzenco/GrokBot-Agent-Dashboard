const ALLOWED = new Set(["http:", "https:", "obsidian:"]);

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Optional http(s) URL. Blank becomes null. Anything else is an error. */
export function parseHttpUrl(
  value: unknown,
  field: string,
  max = 1000,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (Array.from(trimmed).length > max) {
    return { ok: false, error: `${field} must be ${max} characters or fewer` };
  }
  if (!isHttpUrl(trimmed)) return { ok: false, error: `${field} must be http or https` };
  return { ok: true, value: trimmed };
}

export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!ALLOWED.has(parsed.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login")) return "/";
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return "/";
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
