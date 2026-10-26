import { formatIsoMonthDay } from "@/lib/time";
import type { LiveState, Mood, Task } from "@/lib/types";

export const BLOCK_REVIEW_FALLBACK = "Review block note and confirm next step with agent";

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
};

export type AgentBlockedInput = {
  working_on?: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
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
  task: BlockedEntryTask | null;
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
    what = `${title} — ${short}`;
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

function entryBase(agent: BlockedAgentRef, mood: Mood, id: string, kicker: string, details: BlockedDetails): BlockedEntry {
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
    task: null,
  };
}

export function taskBlockedEntry(agent: BlockedAgentRef, task: Task, mood: Mood): BlockedEntry | null {
  if (!task.blocked || task.status === "done") return null;
  const details = resolveBlockedDetails({
    title: task.title,
    details: task.details,
    blocked_note: task.blocked_note,
    blocked_reason: task.blocked_reason,
    unblock_needed: task.unblock_needed,
  });
  return {
    ...entryBase(agent, mood, `task-${task.id}`, "Task", details),
    task: {
      id: task.id,
      note: task.blocked_note ?? "",
      blockedReason: task.blocked_reason ?? task.blocked_note ?? "",
      unblockNeeded: task.unblock_needed ?? "",
    },
  };
}

export function agentBlockedEntry(
  agent: BlockedAgentRef,
  view: {
    state: LiveState;
    working_on?: string | null;
    blocked_reason?: string | null;
    unblock_needed?: string | null;
  } | null | undefined,
  mood: Mood,
): BlockedEntry | null {
  if (!view || view.state !== "blocked") return null;
  const details = resolveBlockedDetails({
    working_on: view.working_on,
    blocked_reason: view.blocked_reason,
    unblock_needed: view.unblock_needed,
  });
  return entryBase(agent, mood, `live-${agent.id}`, "Live status", details);
}

export function reportBlockedEntry(input: {
  agent: BlockedAgentRef;
  mood: Mood;
  reportDate: string;
  text: string;
  index: number;
}): BlockedEntry {
  const details = resolveBlockedDetails(input.text);
  const date = input.reportDate.slice(0, 10);
  return entryBase(
    input.agent,
    input.mood,
    `report-${input.agent.id}-${date}-${input.index}`,
    `Report · ${formatIsoMonthDay(date)}`,
    details,
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
