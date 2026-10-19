export type Priority = "low" | "normal" | "high";
export type TaskStatus = "todo" | "doing" | "done";
export type DocAction = "created" | "edited" | "moved" | "archived";
export type Mood = "active" | "blocked" | "idle";

export type Agent = {
  id: string;
  slug: string;
  name: string;
  role: string;
  sort_order: number;
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
  created_at: string;
  updated_at: string;
  done_at: string | null;
};

export type Report = {
  id: string;
  agent_id: string;
  report_date: string;
  done: string[];
  in_progress: string[];
  blocked: string[];
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
  created_at: string;
};
