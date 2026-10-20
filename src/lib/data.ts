import "server-only";
import { cache } from "react";
import type { AgentIdentity } from "@/lib/api-key";
import { db } from "@/lib/db";
import type { ActivityRow, Agent, AgentStatusRow, DocumentEvent, DocumentRow, Report, Task } from "@/lib/types";

const TASK_COLUMNS =
  "id,title,details,agent_id,priority,status,blocked,blocked_note,created_at,updated_at,done_at";

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
  const { data, error } = await db().from("agent_status").select("agent_id,state,working_on,updated_at");
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

export async function listReports(dateISO: string): Promise<Report[]> {
  const { data, error } = await db()
    .from("reports")
    .select("id,agent_id,report_date,done,in_progress,blocked,posted_at")
    .eq("report_date", dateISO);
  return unwrap(data, error) as Report[];
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

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await db()
    .from("documents")
    .select("id,title,vault_path,url,created_at,last_changed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DocumentRow | null) ?? null;
}
