import Link from "next/link";
import { ProjectPanel } from "@/components/project-panel";
import { Shell } from "@/components/shell";
import { WorkBoard, WorkList, type WorkCard } from "@/components/work-board";
import { WorkCreate } from "@/components/work-create";
import { loadChrome } from "@/lib/chrome";
import { parseTaskQuery, taskMatchesQuery, type TaskMatch } from "@/lib/work";
import { listLabels, listProjects, taskLabelNames } from "@/lib/work-db";

export const dynamic = "force-dynamic";

type Search = {
  view?: string;
  agent?: string;
  project?: string;
  status?: string;
  priority?: string;
  label?: string;
  blocked?: string;
  q?: string;
};

function keep(params: Search, view: string) {
  const search = new URLSearchParams();
  search.set("view", view);
  for (const key of ["agent", "project", "status", "priority", "label", "blocked", "q"] as const) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  return `/work?${search.toString()}`;
}

export default async function WorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const chrome = await loadChrome();
  const [projects, labels, labelMap] = await Promise.all([listProjects(), listLabels(), taskLabelNames()]);
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "view") queryParams.set(key, value);
  }
  const parsed = parseTaskQuery(queryParams);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const agentById = new Map(chrome.agents.map((agent) => [agent.id, agent]));
  const identById = new Map(chrome.tasks.map((task) => [task.id, task.identifier ?? null]));
  const rows: TaskMatch[] = chrome.tasks.map((task) => {
    const project = task.project_id ? projectById.get(task.project_id) : null;
    const assignee = task.assignee_agent_id ? agentById.get(task.assignee_agent_id) : null;
    return {
      ...task,
      project_slug: project?.slug ?? null,
      project_name: project?.name ?? null,
      labels: labelMap.get(task.id) ?? [],
      assignee_slug: assignee?.slug ?? null,
      parent_identifier: task.parent_id ? identById.get(task.parent_id) ?? null : null,
    };
  });
  const scoped = params.agent
    ? rows.filter((task) => agentById.get(task.agent_id)?.slug === params.agent)
    : rows;
  const filtered = parsed.ok ? scoped.filter((task) => taskMatchesQuery(task, parsed.query)) : [];
  const cards: WorkCard[] = filtered.map((task) => ({
    id: task.id,
    identifier: task.identifier ?? null,
    title: task.title,
    status: task.status,
    priority: task.priority,
    blocked: task.blocked,
    agentName: agentById.get(task.agent_id)?.name ?? "Unknown",
    projectName: task.project_name ?? null,
    dueOn: task.due_on ?? null,
    labels: task.labels ?? [],
    updatedAt: task.updated_at,
  }));
  const view = params.view === "list" ? "list" : "board";
  const activeProjects = projects.filter((project) => !project.archived_at);

  return (
    <Shell active="work" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <p className="dateline">Work</p>
      <h1 className="greeting">Tasks</h1>
      <p className="subhead">Board and list for Herzen and the agents. Times are America/Cancun.</p>
      <div className="work-toolbar">
        <Link className={view === "board" ? "btn is-on" : "btn"} href={keep(params, "board")}>
          Board
        </Link>
        <Link className={view === "list" ? "btn is-on" : "btn"} href={keep(params, "list")}>
          List
        </Link>
      </div>
      <form className="work-toolbar" action="/work">
        <input type="hidden" name="view" value={view} />
        <label className="field">
          Search
          <input name="q" defaultValue={params.q ?? ""} placeholder="HQ-123, title, bc-…" />
        </label>
        <label className="field">
          Agent
          <select name="agent" defaultValue={params.agent ?? ""}>
            <option value="">All</option>
            {chrome.agents.map((agent) => (
              <option key={agent.id} value={agent.slug}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Project
          <select name="project" defaultValue={params.project ?? ""}>
            <option value="">All</option>
            {projects.map((project) => (
              <option key={project.id} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">All</option>
            <option value="backlog">Backlog</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="doing">Doing</option>
            <option value="in_review">In review</option>
            <option value="done">Done</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>
        <label className="field">
          Priority
          <select name="priority" defaultValue={params.priority ?? ""}>
            <option value="">All</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="field">
          Label
          <select name="label" defaultValue={params.label ?? ""}>
            <option value="">All</option>
            {labels.map((label) => (
              <option key={label.id} value={label.name}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Blocked
          <select name="blocked" defaultValue={params.blocked ?? ""}>
            <option value="">All</option>
            <option value="true">Blocked</option>
            <option value="false">Not blocked</option>
          </select>
        </label>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>
      {parsed.ok ? null : <p className="form-error">{parsed.error}</p>}
      <WorkCreate agents={chrome.agents} projects={activeProjects} />
      {view === "list" ? <WorkList tasks={cards} /> : <WorkBoard tasks={cards} />}
      <ProjectPanel projects={projects} />
    </Shell>
  );
}
