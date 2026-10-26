import "server-only";
import { cache } from "react";
import type { AgentIdentity } from "@/lib/api-key";
import { db } from "@/lib/db";
import type { OutreachRow, OutreachStatus } from "@/lib/outreach";
import type { ActivityRow, Agent, AgentStatusRow, DocumentEvent, DocumentRow, Report, Task } from "@/lib/types";

const TASK_COLUMNS =
  "id,title,details,agent_id,priority,status,blocked,blocked_note,blocked_reason,unblock_needed,created_at,updated_at,done_at";

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("No data");
  return data;
}

export const listAgents = cache(async (): Promise<Agent[]> => {
  const { data, error } = await db()
    .from("agents")
    .select("id,slug,name,role,sort_order,last_active")
    .order("sort_order", { ascending: true });
  return unwrap(data, error) as Agent[];
});

export async function getAgentBySlug(slug: string): Promise<Agent | null> {
  const { data, error } = await db()
    .from("agents")
    .select("id,slug,name,role,sort_order,last_active")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Agent | null) ?? null;
}

export async function findAgentByKeyHash(hash: string): Promise<AgentIdentity | null> {
  const { data, error } = await db()
    .from("agents")
    .select("id,slug,name,api_key_hash")
    .eq("api_key_hash", hash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.api_key_hash) return null;
  return data as AgentIdentity;
}

export async function listAgentStatus(): Promise<AgentStatusRow[]> {
  const { data, error } = await db()
    .from("agent_status")
    .select("agent_id,state,working_on,updated_at,blocked_reason,unblock_needed");
  return unwrap(data, error) as AgentStatusRow[];
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await db().from("tasks").select(TASK_COLUMNS);
  return unwrap(data, error) as Task[];
}

export async function listTasksForAgent(agentId: string): Promise<Task[]> {
  const { data, error } = await db().from("tasks").select(TASK_COLUMNS).eq("agent_id", agentId);
  return unwrap(data, error) as Task[];
}

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await db().from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Task | null) ?? null;
}

const REPORT_COLUMNS = "id,agent_id,report_date,done,in_progress,blocked,posted_at";

function asReport(row: Report): Report {
  return { ...row, report_date: String(row.report_date).slice(0, 10) };
}

export async function listReports(dateISO: string): Promise<Report[]> {
  const { data, error } = await db().from("reports").select(REPORT_COLUMNS).eq("report_date", dateISO);
  return (unwrap(data, error) as Report[]).map(asReport);
}

/** Distinct report days, newest first. */
export async function listReportDates(limit = 30): Promise<string[]> {
  const cap = Math.min(Math.max(limit, 1), 365);
  const { data, error } = await db()
    .from("reports")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(cap * 40);
  const rows = unwrap(data, error) as { report_date: string }[];
  const dates: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const date = String(row.report_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    seen.add(date);
    dates.push(date);
    if (dates.length >= cap) break;
  }
  return dates;
}

/** Newest report for each agent. */
export async function listLatestReportsByAgent(): Promise<Report[]> {
  const { data, error } = await db()
    .from("reports")
    .select(REPORT_COLUMNS)
    .order("report_date", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(400);
  const rows = (unwrap(data, error) as Report[]).map(asReport);
  const latest = new Map<string, Report>();
  for (const row of rows) {
    const existing = latest.get(row.agent_id);
    if (
      !existing ||
      row.report_date > existing.report_date ||
      (row.report_date === existing.report_date && row.posted_at > existing.posted_at)
    ) {
      latest.set(row.agent_id, row);
    }
  }
  return [...latest.values()];
}

export async function listActivity(startIso: string, endIso: string): Promise<ActivityRow[]> {
  const { data, error } = await db()
    .from("activity")
    .select("id,actor,verb,task_id,document_id,summary,created_at")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: false });
  return unwrap(data, error) as ActivityRow[];
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const { data, error } = await db()
    .from("documents")
    .select("id,title,vault_path,url,created_at,last_changed_at")
    .order("last_changed_at", { ascending: false });
  return unwrap(data, error) as DocumentRow[];
}

export async function listDocumentEvents(documentId?: string): Promise<DocumentEvent[]> {
  let query = db()
    .from("document_events")
    .select("id,document_id,agent_id,action,change_summary,from_path,created_at")
    .order("created_at", { ascending: true });
  if (documentId) query = query.eq("document_id", documentId);
  const { data, error } = await query;
  return unwrap(data, error) as DocumentEvent[];
}

const OUTREACH_COLUMNS =
  "id,agent_id,person_name,company,title,email,linkedin_url,channel,contacted_at,message,status,source_url,created_at,updated_at";

export async function listOutreach(filter?: { agentId?: string; status?: OutreachStatus }): Promise<OutreachRow[]> {
  let query = db().from("outreach").select(OUTREACH_COLUMNS).order("contacted_at", { ascending: false });
  if (filter?.agentId) query = query.eq("agent_id", filter.agentId);
  if (filter?.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  return unwrap(data, error) as OutreachRow[];
}

export async function getOutreach(id: string): Promise<OutreachRow | null> {
  const { data, error } = await db().from("outreach").select(OUTREACH_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OutreachRow | null) ?? null;
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await db()
    .from("documents")
    .select("id,title,vault_path,url,created_at,last_changed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DocumentRow | null) ?? null;
}
