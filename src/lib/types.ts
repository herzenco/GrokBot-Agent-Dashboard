export type Priority = "none" | "low" | "medium" | "normal" | "high" | "urgent";
export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "doing"
  | "done"
  | "canceled";
export type LinkKind = "pr" | "issue" | "doc" | "deploy" | "other";
export type ExternalRefs = Record<string, string>;
export type DocAction = "created" | "edited" | "moved" | "archived";
export type Mood = "active" | "blocked" | "idle";
export type LiveState = "working" | "idle" | "blocked";

export type Agent = {
  id: string;
  slug: string;
  name: string;
  role: string;
  sort_order: number;
  last_active: string | null;
};

export type AgentStatusRow = {
  agent_id: string;
  state: LiveState;
  working_on: string;
  updated_at: string;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
  source_url?: string | null;
};

export type Task = {
  id: string;
  title: string;
  details: string | null;
  agent_id: string;
  priority: Priority;
  status: TaskStatus;
  blocked: boolean;
  blocked_note: string | null;
  blocked_reason?: string | null;
  unblock_needed?: string | null;
  waiting_on?: string | null;
  source_url?: string | null;
  number?: number;
  identifier?: string | null;
  project_id?: string | null;
  assignee_agent_id?: string | null;
  assignee_herzen?: boolean;
  due_on?: string | null;
  parent_id?: string | null;
  external_refs?: ExternalRefs | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Label = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type TaskLink = {
  id: string;
  task_id: string;
  kind: LinkKind;
  url: string;
  label: string | null;
  created_by: string;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type BlockEvent = {
  id: string;
  task_id: string;
  action: "blocked" | "updated" | "cleared";
  blocked_note: string | null;
  blocked_reason: string | null;
  unblock_needed: string | null;
  waiting_on: string | null;
  source_url: string | null;
  actor: string;
  created_at: string;
};

/** One blocked line on a daily report. A string is the legacy shape. */
export type ReportBlockedObject = {
  title: string;
  reason: string | null;
  waiting_on: string | null;
  source_url: string | null;
  source_label: string | null;
};

export type ReportBlockedItem = string | ReportBlockedObject;

export type Report = {
  id: string;
  agent_id: string;
  report_date: string;
  done: string[];
  in_progress: string[];
  blocked: ReportBlockedItem[];
  posted_at: string;
};

export type ActivityRow = {
  id: string;
  actor: string;
  verb: string;
  task_id: string | null;
  document_id: string | null;
  summary: string;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  vault_path: string;
  url: string | null;
  created_at: string;
  last_changed_at: string;
};

export type DocumentEvent = {
  id: string;
  document_id: string;
  agent_id: string;
  action: DocAction;
  change_summary: string;
  from_path: string | null;
  created_at: string;
};
