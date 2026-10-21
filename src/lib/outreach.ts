export const OUTREACH_CHANNELS = ["email", "linkedin", "other"] as const;
export const OUTREACH_STATUSES = ["drafted", "sent", "replied", "meeting"] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export type OutreachRow = {
  id: string;
  agent_id: string;
  person_name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  channel: OutreachChannel;
  contacted_at: string;
  message: string | null;
  status: OutreachStatus;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OutreachWrite = {
  personName: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  channel: OutreachChannel;
  contactedAt: string;
  message: string | null;
  status: OutreachStatus;
  sourceUrl: string | null;
};

export type OutreachPatch = {
  personName?: string;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  channel?: OutreachChannel;
  contactedAt?: string;
  message?: string | null;
  status?: OutreachStatus;
  sourceUrl?: string | null;
};

export type OutreachApiItem = {
  id: string;
  agent: string;
  person_name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  channel: OutreachChannel;
  contacted_at: string;
  message: string | null;
  status: OutreachStatus;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OutreachView = OutreachApiItem & {
  agent_id: string;
  agent_name: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
type Field = string | null | { error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldError(value: Field): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function textField(value: unknown, field: string, max: number, required: boolean): Field {
  if (value === undefined || value === null) {
    if (required) return { error: `${field} is required` };
    return null;
  }
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) return { error: `${field} is required` };
    return null;
  }
  if (Array.from(trimmed).length > max) return { error: `${field} must be ${max} characters or fewer` };
  return trimmed;
}

function httpUrl(value: string | null, field: string): Field {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: `${field} must be http or https` };
    }
  } catch {
    return { error: `${field} must be http or https` };
  }
  return value;
}

function emailField(value: unknown, required: boolean): Field {
  const text = textField(value, "email", 320, required);
  if (fieldError(text) || !text) return text;
  if (!EMAIL.test(text)) return { error: "email must be an email address" };
  return text;
}

export function parseOutreachChannel(value: unknown, required: boolean): OutreachChannel | null | { error: string } {
  if (value === undefined || value === null || value === "") {
    if (required) return { error: "channel is required" };
    return null;
  }
  if (value === "email" || value === "linkedin" || value === "other") return value;
  return { error: "channel must be email, linkedin, or other" };
}

export function parseOutreachStatus(value: unknown, required: boolean): OutreachStatus | null | { error: string } {
  if (value === undefined || value === null || value === "") {
    if (required) return { error: "status is required" };
    return null;
  }
  if (value === "drafted" || value === "sent" || value === "replied" || value === "meeting") return value;
  return { error: "status must be drafted, sent, replied, or meeting" };
}

export function parseOutreachStatusFilter(value: string | null): OutreachStatus | null | { error: string } {
  if (!value) return null;
  const parsed = parseOutreachStatus(value, true);
  if (parsed && typeof parsed === "object" && "error" in parsed) return parsed;
  return parsed;
}

function timestamp(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return { error: "contacted_at must be an ISO timestamp" };
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return { error: "contacted_at must be an ISO timestamp" };
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return { error: "contacted_at must be an ISO timestamp" };
  return new Date(ms).toISOString();
}

export function parseOutreachCreate(body: Record<string, unknown>, nowIso: string): Parsed<OutreachWrite> {
  const personName = textField(body.person_name, "person_name", 200, true);
  if (fieldError(personName) || !personName) {
    return { ok: false, error: fieldError(personName) ? personName.error : "person_name is required" };
  }
  const channel = parseOutreachChannel(body.channel, true);
  if (!channel || fieldError(channel)) {
    return { ok: false, error: channel && fieldError(channel) ? channel.error : "channel is required" };
  }
  const status = parseOutreachStatus(body.status, true);
  if (!status || fieldError(status)) {
    return { ok: false, error: status && fieldError(status) ? status.error : "status is required" };
  }
  const company = textField(body.company, "company", 200, false);
  if (fieldError(company)) return { ok: false, error: company.error };
  const title = textField(body.title, "title", 200, false);
  if (fieldError(title)) return { ok: false, error: title.error };
  const email = emailField(body.email, false);
  if (fieldError(email)) return { ok: false, error: email.error };
  const linkedinText = textField(body.linkedin_url, "linkedin_url", 500, false);
  if (fieldError(linkedinText)) return { ok: false, error: linkedinText.error };
  const linkedinUrl = httpUrl(linkedinText, "linkedin_url");
  if (fieldError(linkedinUrl)) return { ok: false, error: linkedinUrl.error };
  if (!email && !linkedinUrl) return { ok: false, error: "email or linkedin_url is required" };
  const contactedAt = timestamp(body.contacted_at);
  if (fieldError(contactedAt)) return { ok: false, error: contactedAt.error };
  const message = textField(body.message, "message", 8000, false);
  if (fieldError(message)) return { ok: false, error: message.error };
  const sourceText = textField(body.source_url, "source_url", 1000, false);
  if (fieldError(sourceText)) return { ok: false, error: sourceText.error };
  const sourceUrl = httpUrl(sourceText, "source_url");
  if (fieldError(sourceUrl)) return { ok: false, error: sourceUrl.error };

  return {
    ok: true,
    value: {
      personName,
      company,
      title,
      email,
      linkedinUrl,
      channel,
      contactedAt: contactedAt ?? nowIso,
      message,
      status,
      sourceUrl,
    },
  };
}

export function parseOutreachPatch(body: Record<string, unknown>): Parsed<OutreachPatch> {
  const patch: OutreachPatch = {};

  if ("person_name" in body) {
    const personName = textField(body.person_name, "person_name", 200, true);
    if (fieldError(personName) || !personName) {
      return { ok: false, error: fieldError(personName) ? personName.error : "person_name is required" };
    }
    patch.personName = personName;
  }
  if ("company" in body) {
    const company = textField(body.company, "company", 200, false);
    if (fieldError(company)) return { ok: false, error: company.error };
    patch.company = company;
  }
  if ("title" in body) {
    const title = textField(body.title, "title", 200, false);
    if (fieldError(title)) return { ok: false, error: title.error };
    patch.title = title;
  }
  if ("email" in body) {
    const email = emailField(body.email, false);
    if (fieldError(email)) return { ok: false, error: email.error };
    patch.email = email;
  }
  if ("linkedin_url" in body) {
    const linkedinText = textField(body.linkedin_url, "linkedin_url", 500, false);
    if (fieldError(linkedinText)) return { ok: false, error: linkedinText.error };
    const linkedinUrl = httpUrl(linkedinText, "linkedin_url");
    if (fieldError(linkedinUrl)) return { ok: false, error: linkedinUrl.error };
    patch.linkedinUrl = linkedinUrl;
  }
  if ("channel" in body) {
    const channel = parseOutreachChannel(body.channel, true);
    if (!channel || fieldError(channel)) {
      return { ok: false, error: channel && fieldError(channel) ? channel.error : "channel is required" };
    }
    patch.channel = channel;
  }
  if ("status" in body) {
    const status = parseOutreachStatus(body.status, true);
    if (!status || fieldError(status)) {
      return { ok: false, error: status && fieldError(status) ? status.error : "status is required" };
    }
    patch.status = status;
  }
  if ("contacted_at" in body) {
    const contactedAt = timestamp(body.contacted_at);
    if (fieldError(contactedAt)) return { ok: false, error: contactedAt.error };
    if (!contactedAt) return { ok: false, error: "contacted_at must be an ISO timestamp" };
    patch.contactedAt = contactedAt;
  }
  if ("message" in body) {
    const message = textField(body.message, "message", 8000, false);
    if (fieldError(message)) return { ok: false, error: message.error };
    patch.message = message;
  }
  if ("source_url" in body) {
    const sourceText = textField(body.source_url, "source_url", 1000, false);
    if (fieldError(sourceText)) return { ok: false, error: sourceText.error };
    const sourceUrl = httpUrl(sourceText, "source_url");
    if (fieldError(sourceUrl)) return { ok: false, error: sourceUrl.error };
    patch.sourceUrl = sourceUrl;
  }

  const empty = Object.keys(patch).length === 0 && !("agent" in body);
  if (empty) return { ok: false, error: "Send at least one field to update" };
  return { ok: true, value: patch };
}

export function mergedHasContact(
  current: { email: string | null; linkedin_url: string | null },
  patch: OutreachPatch,
): boolean {
  const email = patch.email !== undefined ? patch.email : current.email;
  const linkedin = patch.linkedinUrl !== undefined ? patch.linkedinUrl : current.linkedin_url;
  return Boolean(email || linkedin);
}

/** Owner or admin. Another agent's key cannot read or change the row. */
export function canAccessOutreach(input: { admin: boolean; actorId: string | null; rowAgentId: string }): boolean {
  if (input.admin) return true;
  return input.actorId !== null && input.actorId === input.rowAgentId;
}

export function outreachListScope(input: {
  admin: boolean;
  actorSlug: string | null;
  requestedAgent: string | null;
}): { ok: true; agentSlug: string | null } | { ok: false; status: 403; error: string } {
  const requested = input.requestedAgent?.trim() || null;
  if (input.admin) return { ok: true, agentSlug: requested };
  if (requested && requested !== input.actorSlug) {
    return { ok: false, status: 403, error: "This key cannot read another agent's outreach" };
  }
  return { ok: true, agentSlug: input.actorSlug };
}

export function toOutreachApi(row: OutreachRow, slug: string): OutreachApiItem {
  return {
    id: row.id,
    agent: slug,
    person_name: row.person_name,
    company: row.company,
    title: row.title,
    email: row.email,
    linkedin_url: row.linkedin_url,
    channel: row.channel,
    contacted_at: row.contacted_at,
    message: row.message,
    status: row.status,
    source_url: row.source_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toOutreachView(row: OutreachRow, agent: { slug: string; name: string } | undefined): OutreachView {
  return {
    ...toOutreachApi(row, agent?.slug ?? "unknown"),
    agent_id: row.agent_id,
    agent_name: agent?.name ?? "Unknown agent",
  };
}

export function outreachStatusLabel(status: OutreachStatus): string {
  if (status === "drafted") return "Drafted";
  if (status === "sent") return "Sent";
  if (status === "replied") return "Replied";
  return "Meeting";
}

export function outreachChannelLabel(channel: OutreachChannel): string {
  if (channel === "email") return "Email";
  if (channel === "linkedin") return "LinkedIn";
  return "Other";
}

export function outreachActivitySummary(
  kind: "logged" | "updated",
  row: { person_name: string; company: string | null; status: OutreachStatus },
  previousStatus?: OutreachStatus,
): string {
  const who = row.company ? `${row.person_name} at ${row.company}` : row.person_name;
  if (kind === "logged") return `logged outreach to ${who}`;
  if (previousStatus && previousStatus !== row.status) {
    return `marked outreach to ${who} as ${outreachStatusLabel(row.status).toLowerCase()}`;
  }
  return `updated outreach to ${who}`;
}
