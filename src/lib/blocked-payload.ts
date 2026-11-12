import type { ReportBlockedItem, ReportBlockedObject } from "@/lib/types";
import { parseHttpUrl } from "@/lib/url";

export const BLOCKED_TEXT_MAX = 1000;
export const BLOCKED_STRING_MAX = 300;
const BLOCKED_LIST_MAX = 100;

export type ParsedBlocked =
  | { ok: true; items: ReportBlockedItem[] }
  | { ok: false; error: string };

function textField(
  value: unknown,
  field: string,
  required: boolean,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    if (required) return { ok: false, error: `${field} is required` };
    return { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) return { ok: false, error: `${field} is required` };
    return { ok: true, value: null };
  }
  if (Array.from(trimmed).length > BLOCKED_TEXT_MAX) {
    return { ok: false, error: `${field} must be ${BLOCKED_TEXT_MAX} characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

function asObject(value: unknown): ReportBlockedObject | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "blocked items must be strings or objects" };
  }
  const record = value as Record<string, unknown>;
  const title = textField(record.title, "blocked title", true);
  if (!title.ok) return { error: title.error };
  const reason = textField(record.reason, "blocked reason", false);
  if (!reason.ok) return { error: reason.error };
  const waiting = textField(record.waiting_on, "blocked waiting_on", false);
  if (!waiting.ok) return { error: waiting.error };
  const label = textField(record.source_label, "blocked source_label", false);
  if (!label.ok) return { error: label.error };
  const source = parseHttpUrl(record.source_url, "blocked source_url", BLOCKED_TEXT_MAX);
  if (!source.ok) return { error: source.error };
  return {
    title: title.value ?? "",
    reason: reason.value,
    waiting_on: waiting.value,
    source_url: source.value,
    source_label: label.value,
  };
}

/**
 * Daily report `blocked` array. Each item is a plain string (existing agents)
 * or `{ title, reason, waiting_on, source_url, source_label? }`.
 */
export function parseReportBlocked(value: unknown): ParsedBlocked {
  if (!Array.isArray(value)) return { ok: false, error: "blocked must be an array of strings or objects" };
  if (value.length > BLOCKED_LIST_MAX) return { ok: false, error: "blocked has too many items" };
  const items: ReportBlockedItem[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return { ok: false, error: "blocked cannot contain blank items" };
      if (trimmed.length > BLOCKED_STRING_MAX) {
        return { ok: false, error: "blocked items must be 300 characters or fewer" };
      }
      items.push(trimmed);
      continue;
    }
    const object = asObject(item);
    if ("error" in object) return { ok: false, error: object.error };
    items.push(object);
  }
  return { ok: true, items };
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Keep every stored blocked row visible, including older string-only reports. */
export function readReportBlocked(value: unknown): ReportBlockedItem[] {
  if (!Array.isArray(value)) return [];
  const items: ReportBlockedItem[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      items.push(item.trim() || "Blocked item");
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      items.push({
        title: "Blocked item",
        reason: null,
        waiting_on: null,
        source_url: null,
        source_label: null,
      });
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = nullableText(record.title) || "Blocked item";
    items.push({
      title,
      reason: nullableText(record.reason),
      waiting_on: nullableText(record.waiting_on),
      source_url: nullableText(record.source_url),
      source_label: nullableText(record.source_label),
    });
  }
  return items;
}

export function reportBlockedLabel(item: ReportBlockedItem): string {
  if (typeof item === "string") return item.trim() || "Blocked item";
  return item.title.trim() || "Blocked item";
}
