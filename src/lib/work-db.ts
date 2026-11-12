import "server-only";
import { db } from "@/lib/db";
import { getTask, listAgents } from "@/lib/data";
import { runLinearImport, type AgentRef, type ImportResult, type ImportTask, type LinearStore, type LinearWrite } from "@/lib/linear-import";
import { canonicalStatus, formatIdentifier, inferLinkKind, parseIdentifier, presentTask, slugify, TASK_COLUMNS } from "@/lib/work";
import type { Agent, BlockEvent, ExternalRefs, Label, LinkKind, Project, Task, TaskComment, TaskLink } from "@/lib/types";
import { isUuid } from "@/lib/url";

async function recordActivity(row: {
  actor: string;
  verb: string;
  summary: string;
  task_id?: string | null;
}): Promise<void> {
  const { error } = await db().from("activity").insert({
    actor: row.actor,
    verb: row.verb,
    summary: row.summary,
    task_id: row.task_id ?? null,
    document_id: null,
  });
  if (error) throw new Error(error.message);
}

function quote(title: string): string {
  return `“${title}”`;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await db().from("projects").select("id,name,slug,description,archived_at,created_at,updated_at").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await db()
    .from("projects")
    .select("id,name,slug,description,archived_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Project | null) ?? null;
}

export async function findProject(key: string): Promise<Project | null> {
  if (isUuid(key)) return getProject(key);
  const slug = slugify(key);
  const bySlug = await db()
    .from("projects")
    .select("id,name,slug,description,archived_at,created_at,updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (bySlug.error) throw new Error(bySlug.error.message);
  if (bySlug.data) return bySlug.data as Project;
  const byName = await db()
    .from("projects")
    .select("id,name,slug,description,archived_at,created_at,updated_at")
    .eq("name", key)
    .maybeSingle();
  if (byName.error) throw new Error(byName.error.message);
  return (byName.data as Project | null) ?? null;
}

export async function createProject(input: {
  name: string;
  description?: string | null;
  slug?: string | null;
}): Promise<Project | { error: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required" };
  if (name.length > 80) return { error: "Name must be 80 characters or fewer" };
  const description = input.description?.trim() || null;
  if (description && description.length > 2000) return { error: "Description must be 2000 characters or fewer" };
  const slug = slugify(input.slug?.trim() || name);
  const { data, error } = await db()
    .from("projects")
    .insert({ name, slug, description })
    .select("id,name,slug,description,archived_at,created_at,updated_at")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A project with that name already exists" };
    throw new Error(error.message);
  }
  return data as Project;
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string | null; slug?: string; archived?: boolean },
): Promise<Project | { error: string }> {
  const current = await getProject(id);
  if (!current) return { error: "Project not found" };
  const changes: Record<string, string | null> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { error: "Name is required" };
    if (name.length > 80) return { error: "Name must be 80 characters or fewer" };
    changes.name = name;
    if (patch.slug === undefined) changes.slug = slugify(name);
  }
  if (patch.slug !== undefined) changes.slug = slugify(patch.slug);
  if (patch.description !== undefined) {
    const description = patch.description?.trim() || null;
    if (description && description.length > 2000) return { error: "Description must be 2000 characters or fewer" };
    changes.description = description;
  }
  if (patch.archived === true) changes.archived_at = new Date().toISOString();
  if (patch.archived === false) changes.archived_at = null;
  if (!Object.keys(changes).length) return current;
  const { data, error } = await db()
    .from("projects")
    .update(changes)
    .eq("id", id)
    .select("id,name,slug,description,archived_at,created_at,updated_at")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A project with that name already exists" };
    throw new Error(error.message);
  }
  return data as Project;
}

export async function listLabels(): Promise<Label[]> {
  const { data, error } = await db().from("labels").select("id,name,slug,created_at").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Label[];
}

export async function taskLabelNames(taskIds?: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (taskIds && taskIds.length === 0) return map;
  let query = db().from("task_labels").select("task_id,label_id");
  if (taskIds) query = query.in("task_id", taskIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const labels = await listLabels();
  const byId = new Map(labels.map((label) => [label.id, label.name]));
  for (const row of (data ?? []) as { task_id: string; label_id: string }[]) {
    const name = byId.get(row.label_id);
    if (!name) continue;
    const list = map.get(row.task_id) ?? [];
    list.push(name);
    map.set(row.task_id, list);
  }
  return map;
}

export async function replaceTaskLabels(task: Task, names: string[], actor: string): Promise<string[]> {
  const before = ((await taskLabelNames([task.id])).get(task.id) ?? []).slice().sort();
  const after = (await setTaskLabels(task.id, names)).slice().sort();
  if (before.join("\n") !== after.join("\n")) {
    await recordActivity({
      actor,
      verb: "updated",
      task_id: task.id,
      summary: `set labels on ${quote(task.title)} to ${after.join(", ") || "none"}`,
    });
  }
  return after;
}

export async function setTaskLabels(taskId: string, names: string[]): Promise<string[]> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    wanted.set(slugify(trimmed), trimmed);
  }
  const existing = await listLabels();
  const bySlug = new Map(existing.map((label) => [label.slug, label]));
  for (const [slug, name] of wanted) {
    if (bySlug.has(slug)) continue;
    const { data, error } = await db().from("labels").insert({ name, slug }).select("id,name,slug,created_at").single();
    if (error) {
      if (error.code !== "23505") throw new Error(error.message);
      const { data: raced, error: readError } = await db().from("labels").select("id,name,slug,created_at").eq("slug", slug).single();
      if (readError) throw new Error(readError.message);
      bySlug.set(slug, raced as Label);
      continue;
    }
    bySlug.set(slug, data as Label);
  }
  const ids = [...wanted.keys()].map((slug) => bySlug.get(slug)?.id).filter((id): id is string => Boolean(id));
  const { error: clearError } = await db().from("task_labels").delete().eq("task_id", taskId);
  if (clearError) throw new Error(clearError.message);
  if (ids.length) {
    const { error } = await db().from("task_labels").insert(ids.map((labelId) => ({ task_id: taskId, label_id: labelId })));
    if (error) throw new Error(error.message);
  }
  return [...wanted.values()];
}

const LINK_COLUMNS = "id,task_id,kind,url,label,created_by,created_at";

export async function listTaskLinks(taskId?: string): Promise<TaskLink[]> {
  let query = db().from("task_links").select(LINK_COLUMNS).order("created_at");
  if (taskId) query = query.eq("task_id", taskId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskLink[];
}

export async function ensureTaskLink(input: {
  taskId: string;
  url: string;
  kind?: LinkKind;
  label?: string | null;
  createdBy: string;
}): Promise<TaskLink> {
  const url = input.url.trim();
  const { data: existing, error: readError } = await db()
    .from("task_links")
    .select(LINK_COLUMNS)
    .eq("task_id", input.taskId)
    .eq("url", url)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) return existing as TaskLink;
  const kind = input.kind ?? inferLinkKind(url);
  const { data, error } = await db()
    .from("task_links")
    .insert({
      task_id: input.taskId,
      url,
      kind,
      label: input.label?.trim() || null,
      created_by: input.createdBy,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = await getTask(input.taskId);
  await recordActivity({
    actor: input.createdBy,
    verb: "updated",
    task_id: input.taskId,
    summary: `added a ${kind} link on ${quote(task?.title ?? "a task")}`,
  });
  return data as TaskLink;
}

export async function updateTaskLink(
  id: string,
  patch: { kind?: LinkKind; url?: string; label?: string | null },
): Promise<TaskLink | { error: string }> {
  const changes: Record<string, string | null> = {};
  if (patch.kind) changes.kind = patch.kind;
  if (patch.url !== undefined) {
    const url = patch.url.trim();
    if (!url) return { error: "url is required" };
    changes.url = url;
  }
  if (patch.label !== undefined) changes.label = patch.label?.trim() || null;
  if (!Object.keys(changes).length) {
    const { data, error } = await db().from("task_links").select(LINK_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: "Link not found" };
    return data as TaskLink;
  }
  const { data, error } = await db().from("task_links").update(changes).eq("id", id).select(LINK_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: "Link not found" };
  return data as TaskLink;
}

export async function deleteTaskLink(id: string, actor = "herzen"): Promise<TaskLink | null> {
  const { data, error } = await db().from("task_links").delete().eq("id", id).select(LINK_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  const link = (data as TaskLink | null) ?? null;
  if (!link) return null;
  const task = await getTask(link.task_id);
  await recordActivity({
    actor,
    verb: "updated",
    task_id: link.task_id,
    summary: `removed a link from ${quote(task?.title ?? "a task")}`,
  });
  return link;
}

const COMMENT_COLUMNS = "id,task_id,author,body,created_at,updated_at";

export async function listComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await db().from("task_comments").select(COMMENT_COLUMNS).eq("task_id", taskId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskComment[];
}

export async function getComment(id: string): Promise<TaskComment | null> {
  const { data, error } = await db().from("task_comments").select(COMMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TaskComment | null) ?? null;
}

export async function addComment(input: { task: Task; author: string; body: string }): Promise<TaskComment> {
  const { data, error } = await db()
    .from("task_comments")
    .insert({ task_id: input.task.id, author: input.author, body: input.body.trim() })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await recordActivity({
    actor: input.author,
    verb: "commented",
    task_id: input.task.id,
    summary: `commented on ${quote(input.task.title)}`,
  });
  return data as TaskComment;
}

export async function updateComment(id: string, body: string, actor: string): Promise<TaskComment | { error: string }> {
  const current = await getComment(id);
  if (!current) return { error: "Comment not found" };
  if (actor !== "herzen" && actor !== current.author) return { error: "Comment not found" };
  const { data, error } = await db()
    .from("task_comments")
    .update({ body: body.trim() })
    .eq("id", id)
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const task = await getTask(current.task_id);
  await recordActivity({
    actor,
    verb: "commented",
    task_id: current.task_id,
    summary: `edited a comment on ${quote(task?.title ?? "a task")}`,
  });
  return data as TaskComment;
}

export async function deleteComment(id: string, actor: string): Promise<TaskComment | { error: string }> {
  const current = await getComment(id);
  if (!current) return { error: "Comment not found" };
  if (actor !== "herzen" && actor !== current.author && actor !== "admin") return { error: "Comment not found" };
  const { data, error } = await db().from("task_comments").delete().eq("id", id).select(COMMENT_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: "Comment not found" };
  const task = await getTask(current.task_id);
  await recordActivity({
    actor: actor === "admin" ? current.author : actor,
    verb: "commented",
    task_id: current.task_id,
    summary: `removed a comment on ${quote(task?.title ?? "a task")}`,
  });
  return data as TaskComment;
}

export async function listBlockEvents(taskId: string): Promise<BlockEvent[]> {
  const { data, error } = await db()
    .from("task_block_events")
    .select("id,task_id,action,blocked_note,blocked_reason,unblock_needed,waiting_on,source_url,actor,created_at")
    .eq("task_id", taskId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as BlockEvent[];
}

export async function insertBlockEvent(input: {
  taskId: string;
  actor: string;
  action: BlockEvent["action"];
  snapshot: {
    blocked_note: string | null;
    blocked_reason: string | null;
    unblock_needed: string | null;
    waiting_on: string | null;
    source_url: string | null;
  };
}): Promise<void> {
  const { error } = await db().from("task_block_events").insert({
    task_id: input.taskId,
    action: input.action,
    actor: input.actor,
    ...input.snapshot,
  });
  if (error) throw new Error(error.message);
}

export async function listTaskActivity(taskId: string) {
  const { data, error } = await db()
    .from("activity")
    .select("id,actor,verb,task_id,document_id,summary,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSubtasks(parentId: string): Promise<Task[]> {
  const { data, error } = await db().from("tasks").select(TASK_COLUMNS).eq("parent_id", parentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function findTaskByKey(key: string): Promise<Task | null> {
  const number = parseIdentifier(key);
  if (number) {
    const { data, error } = await db().from("tasks").select(TASK_COLUMNS).eq("number", number).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Task | null) ?? null;
  }
  if (!isUuid(key)) return null;
  return getTask(key);
}

export async function listParentMap(): Promise<Map<string, string | null>> {
  const { data, error } = await db().from("tasks").select("id,parent_id");
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; parent_id: string | null }[]).map((row) => [row.id, row.parent_id]));
}

export async function resolveTaskRelations(
  input: { project?: string | null; assignee?: string | null; parent?: string | null },
  agents: Agent[],
): Promise<
  | {
      project_id?: string | null;
      assignee_agent_id?: string | null;
      assignee_herzen?: boolean;
      parent_id?: string | null;
    }
  | { error: string }
> {
  const resolved: {
    project_id?: string | null;
    assignee_agent_id?: string | null;
    assignee_herzen?: boolean;
    parent_id?: string | null;
  } = {};
  if (input.project !== undefined) {
    if (!input.project) resolved.project_id = null;
    else {
      const project = await findProject(input.project);
      if (!project) return { error: "Unknown project" };
      resolved.project_id = project.id;
    }
  }
  if (input.assignee !== undefined) {
    if (!input.assignee) {
      resolved.assignee_herzen = false;
      resolved.assignee_agent_id = null;
    } else if (input.assignee === "herzen") {
      resolved.assignee_herzen = true;
      resolved.assignee_agent_id = null;
    } else {
      const agent = agents.find(
        (item) => item.slug === input.assignee || item.id === input.assignee || item.name.toLowerCase() === input.assignee?.toLowerCase(),
      );
      if (!agent) return { error: "Unknown assignee" };
      resolved.assignee_herzen = false;
      resolved.assignee_agent_id = agent.id;
    }
  }
  if (input.parent !== undefined) {
    if (!input.parent) resolved.parent_id = null;
    else {
      const parent = await findTaskByKey(input.parent);
      if (!parent) return { error: "Unknown parent task" };
      resolved.parent_id = parent.id;
    }
  }
  return resolved;
}

function toImportTask(task: Task, labels: string[]): ImportTask {
  const refs = (task.external_refs ?? {}) as ExternalRefs;
  return {
    id: task.id,
    identifier: task.identifier ?? (task.number ? formatIdentifier(task.number) : null),
    linearId: refs.linear_id ?? "",
    title: task.title,
    details: task.details,
    status: task.status === "doing" ? "in_progress" : (task.status as ImportTask["status"]),
    priority: task.priority === "normal" ? "medium" : (task.priority as ImportTask["priority"]),
    agentId: task.agent_id,
    projectId: task.project_id ?? null,
    assigneeHerzen: Boolean(task.assignee_herzen),
    assigneeAgentId: task.assignee_agent_id ?? null,
    dueOn: task.due_on ?? null,
    parentId: task.parent_id ?? null,
    url: refs.linear_url ?? null,
    labels,
    externalRefs: refs,
  };
}

export async function importLinearIssues(body: unknown): Promise<ImportResult | { error: string }> {
  const agents = await listAgents();
  if (!agents.length) return { error: "No agents are available to own imported tasks" };
  const fallback = agents.find((agent) => agent.slug === "roger") ?? agents[0];
  const labelMap = await taskLabelNames();
  const store: LinearStore = {
    async findByLinearId(linearId) {
      const { data, error } = await db()
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("external_refs->>linear_id", linearId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const task = data as Task;
      return toImportTask(task, labelMap.get(task.id) ?? []);
    },
    async insert(row: LinearWrite) {
      const { data, error } = await db()
        .from("tasks")
        .insert({
          title: row.title,
          details: row.details,
          agent_id: row.agentId,
          priority: row.priority,
          status: row.status,
          project_id: row.projectId,
          assignee_agent_id: row.assigneeAgentId,
          assignee_herzen: row.assigneeHerzen,
          due_on: row.dueOn,
          parent_id: row.parentId,
          external_refs: row.externalRefs,
          done_at: row.status === "done" ? new Date().toISOString() : null,
        })
        .select(TASK_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const task = data as Task;
      await recordActivity({
        actor: "import",
        verb: "created",
        task_id: task.id,
        summary: `imported ${quote(task.title)} from Linear ${row.linearId}`,
      });
      labelMap.set(task.id, row.labels);
      return toImportTask(task, row.labels);
    },
    async update(id, row) {
      const { data, error } = await db()
        .from("tasks")
        .update({
          title: row.title,
          details: row.details,
          agent_id: row.agentId,
          priority: row.priority,
          status: row.status,
          project_id: row.projectId,
          assignee_agent_id: row.assigneeAgentId,
          assignee_herzen: row.assigneeHerzen,
          due_on: row.dueOn,
          parent_id: row.parentId,
          external_refs: row.externalRefs,
        })
        .eq("id", id)
        .select(TASK_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      labelMap.set(id, row.labels);
      return toImportTask(data as Task, row.labels);
    },
    async ensureProject(name) {
      const found = await findProject(name);
      if (found) return { id: found.id, name: found.name };
      const created = await createProject({ name });
      if ("error" in created) throw new Error(created.error);
      return { id: created.id, name: created.name };
    },
    async setLabels(taskId, names) {
      const saved = await setTaskLabels(taskId, names);
      labelMap.set(taskId, saved);
    },
    async ensureLink(taskId, url, kind) {
      await ensureTaskLink({ taskId, url, kind, createdBy: "import" });
    },
  };
  const refs: AgentRef[] = agents.map((agent) => ({ id: agent.id, slug: agent.slug, name: agent.name }));
  return runLinearImport(body, store, refs, fallback.id);
}

export async function presentStoredTasks(tasks: Task[]) {
  const ids = new Set(tasks.map((task) => task.id));
  const [agents, projects, labels, links, identityResult] = await Promise.all([
    listAgents(),
    listProjects(),
    taskLabelNames(tasks.map((task) => task.id)),
    listTaskLinks(),
    db().from("tasks").select("id,identifier"),
  ]);
  if (identityResult.error) throw new Error(identityResult.error.message);
  const identById = new Map(
    ((identityResult.data ?? []) as { id: string; identifier: string | null }[]).map((row) => [row.id, row.identifier]),
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const linksByTask = new Map<string, TaskLink[]>();
  for (const link of links) {
    if (!ids.has(link.task_id)) continue;
    const list = linksByTask.get(link.task_id) ?? [];
    list.push(link);
    linksByTask.set(link.task_id, list);
  }
  return tasks.map((task) => {
    const project = task.project_id ? projectById.get(task.project_id) ?? null : null;
    const assignee = task.assignee_agent_id ? agentById.get(task.assignee_agent_id) : null;
    return {
      ...presentTask(task, {
        agent: agentById.get(task.agent_id)?.slug ?? null,
        project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
        assignee: assignee?.slug ?? null,
        parent: task.parent_id ? identById.get(task.parent_id) ?? null : null,
        labels: labels.get(task.id) ?? [],
        links: linksByTask.get(task.id) ?? [],
      }),
      project_slug: project?.slug ?? null,
      project_name: project?.name ?? null,
      assignee_slug: assignee?.slug ?? null,
      parent_identifier: task.parent_id ? identById.get(task.parent_id) ?? null : null,
    };
  });
}

export async function presentStoredTask(task: Task, detail = false) {
  const [presented] = await presentStoredTasks([task]);
  if (!detail) return presented;
  const [comments, activity, blockHistory, subtasks] = await Promise.all([
    listComments(task.id),
    listTaskActivity(task.id),
    listBlockEvents(task.id),
    listSubtasks(task.id),
  ]);
  return {
    ...presented,
    comments,
    activity,
    block_history: blockHistory,
    subtasks: subtasks.map((item) => ({
      id: item.id,
      identifier: item.identifier ?? null,
      title: item.title,
      status: canonicalStatus(item.status),
    })),
  };
}
