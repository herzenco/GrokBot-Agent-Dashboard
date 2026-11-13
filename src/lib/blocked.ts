import { formatCancunTimestamp, formatIsoMonthDay } from "@/lib/time";
import { isClosedStatus } from "@/lib/work";
import type { LiveState, Mood, ReportBlockedItem, ResolutionState, Task } from "@/lib/types";
import { isHttpUrl } from "@/lib/url";

export const BLOCK_REVIEW_FALLBACK = "Review block note and confirm next step with agent";

export const NOT_PROVIDED = "Not provided";

export type BlockedDetails = {
  whatBlocked: string;
  whyBlocked: string;
  unblockNeeded: string;
};

export type TaskBlockedInput = {
  title: string;
  details?: string | null;
  blocked_note?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
};

export type AgentBlockedInput = {
  working_on?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
};

export type ReportBlockedInput = {
  text: string;
};

export type BlockedAgentRef = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type BlockedEntryTask = {
  id: string;
  note: string;
  blockedReason: string;
  unblockNeeded: string;
};

export type BlockedEntry = {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentSlug: string;
  mood: Mood;
  kicker: string;
  whatBlocked: string;
  whyBlocked: string;
  unblockNeeded: string;
  waitingOn: string;
  reportedAt: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  task: BlockedEntryTask | null;
  resolutionState?: ResolutionState;
};

export type BlockedDetailView = {
  agent: string;
  item: string;
  reason: string;
  waitingOn: string;
  reportedAt: string;
  sourceHref: string | null;
  sourceLabel: string;
  unblockNeeded: string;
};

function squash(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function tidy(value: string): string {
  return squash(value).replace(/[.;,]+$/g, "").trim();
}

function sentence(value: string): string {
  const text = tidy(value);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function inferUnblock(what: string, why: string, needRaw: string): string {
  const cleaned = tidy(needRaw);
  if (!cleaned) return BLOCK_REVIEW_FALLBACK;
  if (/^reconnect(?:ing|ion)?$/i.test(cleaned)) {
    const product = what.match(/^(.+?)\s+(?:unreadable|unread|down|broken|unavailable|stuck|failing|offline)\b/i);
    const name = product ? tidy(product[1]) : "";
    if (/connector\s*\/\s*imap/i.test(`${why} ${what}`)) {
      return `Reconnect ${name ? `${name} ` : ""}connector / IMAP`.replace(/\s+/g, " ").trim();
    }
    return name ? `Reconnect ${name}` : "Reconnect";
  }
  return sentence(cleaned);
}

/** Who or what a free-text block says it is waiting on. Empty when the line never says. */
export function waitingPhrase(text: string): string {
  const value = squash(text);
  if (!value) return "";
  const waiting = value.match(/\bwaiting on\s+(.+)$/i);
  if (waiting) return sentence(waiting[1]);
  const awaiting = value.match(/\bawaiting\s+(.+)$/i);
  if (awaiting) return sentence(awaiting[1]);
  const hold = value.match(/\bon hold per\s+(.+)$/i);
  if (hold) return sentence(tidy(hold[1]));
  return "";
}

function extractNeedPhrase(text: string): string | null {
  const value = squash(text);
  if (!value) return null;
  const waiting = value.match(/\bwaiting on\s+(.+)$/i);
  if (waiting) return sentence(waiting[1]) || null;
  const awaiting = value.match(/\bawaiting\s+(.+)$/i);
  if (awaiting) return sentence(awaiting[1]) || null;
  const hold = value.match(/\bon hold per\s+(.+)$/i);
  if (hold) return sentence(`confirmation from ${tidy(hold[1])}`) || null;
  const needs = value.match(/\bneeds?\s+(.+)$/i);
  if (needs) return inferUnblock(value, value, needs[1]);
  return null;
}

function whyFromNote(note: string): string {
  const text = squash(note);
  if (!text) return "";
  const parts = text.split(/\s*[—–;]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return sentence(parts[0]);
  return sentence(text);
}

function fromSubjectAndRest(whatRaw: string, restRaw: string): BlockedDetails {
  const what = tidy(whatRaw) || "Blocked item";
  const rest = squash(restRaw);
  const needsSplit = rest.match(/^(.*?)(?:,\s*|\s+)needs?\s+(.+)$/i);
  if (needsSplit && tidy(needsSplit[1])) {
    const why = sentence(needsSplit[1]);
    return {
      whatBlocked: what,
      whyBlocked: why || "Blocked",
      unblockNeeded: inferUnblock(what, why, needsSplit[2]),
    };
  }
  const waiting = rest.match(/^waiting on\s+(.+)$/i);
  if (waiting) {
    const action = tidy(waiting[1]);
    return {
      whatBlocked: what,
      whyBlocked: sentence(`waiting on ${action}`) || "Blocked",
      unblockNeeded: sentence(action) || BLOCK_REVIEW_FALLBACK,
    };
  }
  const awaiting = rest.match(/^awaiting\s+(.+)$/i);
  if (awaiting) {
    const action = tidy(awaiting[1]);
    return {
      whatBlocked: what,
      whyBlocked: sentence(`awaiting ${action}`) || "Blocked",
      unblockNeeded: sentence(action) || BLOCK_REVIEW_FALLBACK,
    };
  }
  const hold = rest.match(/^on hold per\s+(.+)$/i);
  if (hold) {
    const who = tidy(hold[1]);
    return {
      whatBlocked: what,
      whyBlocked: sentence(`on hold per ${who}`) || "Blocked",
      unblockNeeded: sentence(`confirmation from ${who}`) || BLOCK_REVIEW_FALLBACK,
    };
  }
  return {
    whatBlocked: what,
    whyBlocked: sentence(rest) || "Blocked",
    unblockNeeded: extractNeedPhrase(rest) ?? BLOCK_REVIEW_FALLBACK,
  };
}

export function fromReportText(raw: string): BlockedDetails {
  const text = squash(raw);
  if (!text) {
    return {
      whatBlocked: "Blocked item",
      whyBlocked: "No details were posted",
      unblockNeeded: BLOCK_REVIEW_FALLBACK,
    };
  }

  const colon = text.match(/^(.+?):\s+(.+)$/);
  if (colon) return fromSubjectAndRest(colon[1], colon[2]);

  const dash = text.match(/^(.+?)\s+[—–]\s+(.+)$/);
  if (dash) return fromSubjectAndRest(dash[1], dash[2]);

  const waiting = text.match(/^(.*?)\s+waiting on\s+(.+)$/i);
  if (waiting && tidy(waiting[1])) {
    const action = tidy(waiting[2]);
    return {
      whatBlocked: tidy(waiting[1]),
      whyBlocked: sentence(`waiting on ${action}`),
      unblockNeeded: sentence(action) || BLOCK_REVIEW_FALLBACK,
    };
  }

  const awaiting = text.match(/^(.*?)\s+awaiting\s+(.+)$/i);
  if (awaiting && tidy(awaiting[1])) {
    const action = tidy(awaiting[2]);
    return {
      whatBlocked: tidy(awaiting[1]),
      whyBlocked: sentence(`awaiting ${action}`),
      unblockNeeded: sentence(action) || BLOCK_REVIEW_FALLBACK,
    };
  }

  const hold = text.match(/^(.*?)\s+on hold per\s+(.+)$/i);
  if (hold && tidy(hold[1])) {
    const who = tidy(hold[2]);
    return {
      whatBlocked: tidy(hold[1]),
      whyBlocked: sentence(`on hold per ${who}`),
      unblockNeeded: sentence(`confirmation from ${who}`) || BLOCK_REVIEW_FALLBACK,
    };
  }

  const needs = text.match(/^(.*?)\s+needs?\s+(.+)$/i);
  if (needs && tidy(needs[1])) {
    const what = tidy(needs[1]);
    return {
      whatBlocked: what,
      whyBlocked: sentence(text),
      unblockNeeded: inferUnblock(what, text, needs[2]),
    };
  }

  return {
    whatBlocked: tidy(text) || "Blocked item",
    whyBlocked: sentence(text) || "Blocked",
    unblockNeeded: extractNeedPhrase(text) ?? BLOCK_REVIEW_FALLBACK,
  };
}

function fromTask(task: TaskBlockedInput): BlockedDetails {
  const title = squash(task.title) || "Blocked task";
  const details = squash(task.details);
  const note = squash(task.blocked_note);
  const reason = squash(task.blocked_reason);
  const needed = squash(task.unblock_needed);

  let what = title;
  if (details && details.toLowerCase() !== title.toLowerCase() && !title.toLowerCase().includes(details.toLowerCase())) {
    const short = details.length > 180 ? `${details.slice(0, 177).trimEnd()}…` : details;
    what = `${title}: ${short}`;
  }

  return {
    whatBlocked: what,
    whyBlocked: (reason ? sentence(reason) : whyFromNote(note)) || "Blocked",
    unblockNeeded: (needed ? sentence(needed) : extractNeedPhrase(note) || extractNeedPhrase(details)) || BLOCK_REVIEW_FALLBACK,
  };
}

function fromAgent(agent: AgentBlockedInput): BlockedDetails {
  const working = squash(agent.working_on) || "Blocked";
  const reason = squash(agent.blocked_reason);
  const needed = squash(agent.unblock_needed);
  return {
    whatBlocked: working,
    whyBlocked: (reason ? sentence(reason) : sentence(working)) || "Blocked",
    unblockNeeded: (needed ? sentence(needed) : extractNeedPhrase(working)) || BLOCK_REVIEW_FALLBACK,
  };
}

function isTaskInput(input: object): input is TaskBlockedInput {
  return "title" in input;
}

function isReportInput(input: object): input is ReportBlockedInput {
  return "text" in input && !("title" in input);
}

export function resolveBlockedDetails(
  input: TaskBlockedInput | AgentBlockedInput | ReportBlockedInput | string,
): BlockedDetails {
  if (typeof input === "string") return fromReportText(input);
  if (isTaskInput(input)) return fromTask(input);
  if (isReportInput(input)) return fromReportText(input.text);
  return fromAgent(input);
}

const REPORT_SOURCE = /^\/reports\?date=\d{4}-\d{2}-\d{2}$/;

export function sourceHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (REPORT_SOURCE.test(trimmed)) return trimmed;
  return isHttpUrl(trimmed) ? trimmed : null;
}

export function sourceLabelFor(href: string, explicit?: string | null): string {
  const label = explicit?.replace(/\s+/g, " ").trim();
  if (label) return label;
  if (href.startsWith("/reports")) return "Daily report";
  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "github.com" && /\/pull\/\d+/.test(parsed.pathname)) return "GitHub PR";
    if (host === "linear.app" || host.endsWith(".linear.app")) return "Linear issue";
  } catch {
    return "Source";
  }
  return "Source";
}

export function reportSourcePath(reportDate: string): string | null {
  const date = reportDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `/reports?date=${date}` : null;
}

function shown(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text || NOT_PROVIDED;
}

/** Fields the detail view renders. Missing values stay visible as "Not provided". */
export function blockedDetailFields(entry: BlockedEntry): BlockedDetailView {
  const item = shown(entry.whatBlocked);
  const rawReason = entry.whyBlocked.replace(/\s+/g, " ").trim();
  const reason = !rawReason || rawReason.toLowerCase() === item.toLowerCase() ? NOT_PROVIDED : rawReason;
  const href = sourceHref(entry.sourceUrl);
  const reported = entry.reportedAt ? formatCancunTimestamp(entry.reportedAt) : null;
  return {
    agent: shown(entry.agentName),
    item,
    reason,
    waitingOn: shown(entry.waitingOn),
    reportedAt: reported ?? NOT_PROVIDED,
    sourceHref: href,
    sourceLabel: href ? sourceLabelFor(href, entry.sourceLabel) : NOT_PROVIDED,
    unblockNeeded: shown(entry.unblockNeeded),
  };
}

type EntryExtra = {
  waitingOn?: string;
  reportedAt?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
};

function entryBase(
  agent: BlockedAgentRef,
  mood: Mood,
  id: string,
  kicker: string,
  details: BlockedDetails,
  extra: EntryExtra = {},
): BlockedEntry {
  return {
    id,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role,
    agentSlug: agent.slug,
    mood,
    kicker,
    whatBlocked: details.whatBlocked,
    whyBlocked: details.whyBlocked,
    unblockNeeded: details.unblockNeeded,
    waitingOn: (extra.waitingOn ?? "").replace(/\s+/g, " ").trim(),
    reportedAt: extra.reportedAt ?? null,
    sourceUrl: extra.sourceUrl ?? null,
    sourceLabel: extra.sourceLabel?.replace(/\s+/g, " ").trim() || null,
    task: null,
  };
}

function taskWaiting(task: TaskBlockedInput & { blocked_note?: string | null }): string {
  const explicit = squash(task.waiting_on);
  if (explicit) return sentence(explicit);
  const phrase = waitingPhrase(`${task.blocked_note ?? ""} ${task.details ?? ""}`);
  if (phrase) return phrase;
  const needed = squash(task.unblock_needed);
  return needed ? sentence(needed) : "";
}

export function taskBlockedEntry(agent: BlockedAgentRef, task: Task, mood: Mood): BlockedEntry | null {
  if (!task.blocked || isClosedStatus(task.status)) return null;
  const details = resolveBlockedDetails({
    title: task.title,
    details: task.details,
    blocked_note: task.blocked_note,
    blocked_reason: task.blocked_reason,
    unblock_needed: task.unblock_needed,
    waiting_on: task.waiting_on,
  });
  return {
    ...entryBase(agent, mood, `task-${task.id}`, "Task", details, {
      waitingOn: taskWaiting(task),
      reportedAt: task.updated_at,
      sourceUrl: sourceHref(task.source_url),
    }),
    task: {
      id: task.id,
      note: task.blocked_note ?? "",
      blockedReason: task.blocked_reason ?? task.blocked_note ?? "",
      unblockNeeded: task.unblock_needed ?? "",
    },
    resolutionState: task.resolution_state ?? (task.resolution_pending ? "awaiting_agent" : "none"),
  };
}

export function blockedEntriesByTaskId(agents: BlockedAgentRef[], tasks: Task[]): Record<string, BlockedEntry> {
  const byAgent = new Map(agents.map((agent) => [agent.id, agent]));
  const entries: Record<string, BlockedEntry> = {};
  for (const task of tasks) {
    const agent = byAgent.get(task.agent_id);
    if (!agent) continue;
    const entry = taskBlockedEntry(agent, task, "blocked");
    if (entry) entries[task.id] = entry;
  }
  return entries;
}

export function agentBlockedEntry(
  agent: BlockedAgentRef,
  view: {
    state: LiveState;
    working_on?: string | null;
    blocked_reason?: string | null;
    unblock_needed?: string | null;
    waiting_on?: string | null;
    source_url?: string | null;
    reported_at?: string | null;
    updated_at?: string | null;
  } | null | undefined,
  mood: Mood,
): BlockedEntry | null {
  if (!view || view.state !== "blocked") return null;
  const details = resolveBlockedDetails({
    working_on: view.working_on,
    blocked_reason: view.blocked_reason,
    unblock_needed: view.unblock_needed,
    waiting_on: view.waiting_on,
  });
  const explicit = squash(view.waiting_on);
  const phrase = waitingPhrase(view.working_on ?? "");
  const needed = squash(view.unblock_needed);
  const waitingOn = explicit ? sentence(explicit) : phrase || (needed ? sentence(needed) : "");
  return entryBase(agent, mood, `live-${agent.id}`, "Live status", details, {
    waitingOn,
    reportedAt: view.reported_at ?? view.updated_at ?? null,
    sourceUrl: sourceHref(view.source_url),
  });
}

export function reportBlockedEntry(input: {
  agent: BlockedAgentRef;
  mood: Mood;
  reportDate: string;
  item: ReportBlockedItem;
  index: number;
  postedAt?: string | null;
}): BlockedEntry {
  const date = input.reportDate.slice(0, 10);
  const id = `report-${input.agent.id}-${date}-${input.index}`;
  const kicker = `Report · ${formatIsoMonthDay(date)}`;
  const reportLink = reportSourcePath(date);
  if (typeof input.item === "string") {
    const details = resolveBlockedDetails(input.item);
    return entryBase(input.agent, input.mood, id, kicker, details, {
      waitingOn: waitingPhrase(input.item),
      reportedAt: input.postedAt ?? null,
      sourceUrl: reportLink,
    });
  }
  const title = squash(input.item.title) || "Blocked item";
  const reason = squash(input.item.reason);
  const waiting = squash(input.item.waiting_on);
  const external = sourceHref(input.item.source_url);
  return entryBase(
    input.agent,
    input.mood,
    id,
    kicker,
    {
      whatBlocked: title,
      whyBlocked: reason ? sentence(reason) : "",
      unblockNeeded: waiting ? sentence(waiting) : "",
    },
    {
      waitingOn: waiting ? sentence(waiting) : "",
      reportedAt: input.postedAt ?? null,
      sourceUrl: external ?? reportLink,
      sourceLabel: input.item.source_label,
    },
  );
}

export function collectBlockedEntries(input: {
  agents: BlockedAgentRef[];
  tasks: Task[];
  live: {
    agent_id: string;
    state: LiveState;
    working_on?: string | null;
    blocked_reason?: string | null;
    unblock_needed?: string | null;
    waiting_on?: string | null;
    source_url?: string | null;
    reported_at?: string | null;
    updated_at?: string | null;
  }[];
  moods: Map<string, Mood>;
}): BlockedEntry[] {
  const liveByAgent = new Map(input.live.map((view) => [view.agent_id, view]));
  const entries: BlockedEntry[] = [];
  for (const agent of input.agents) {
    const mood = input.moods.get(agent.id) ?? "idle";
    const liveEntry = agentBlockedEntry(agent, liveByAgent.get(agent.id), mood);
    if (liveEntry) entries.push(liveEntry);
    for (const task of input.tasks) {
      if (task.agent_id !== agent.id) continue;
      const taskEntry = taskBlockedEntry(agent, task, mood);
      if (taskEntry) entries.push(taskEntry);
    }
  }
  return entries;
}
