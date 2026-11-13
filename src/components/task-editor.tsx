"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlockedDetailModal } from "@/components/blocked-detail-modal";
import { AwaitingAgentBadge, ResolutionBox } from "@/components/resolution-box";
import {
  addTaskLinkAction,
  commentOnTaskAction,
  removeTaskLinkAction,
  updateWorkTaskAction,
} from "@/app/work-actions";
import { taskBlockedEntry, type BlockedAgentRef } from "@/lib/blocked";
import { formatCancunTimestamp } from "@/lib/time";
import type { BlockEvent, Task, TaskComment, TaskLink } from "@/lib/types";
import { LINK_KINDS, PRIORITY_OPTIONS, WORK_COLUMNS, canonicalPriority, columnStatus, isClosedStatus, personName } from "@/lib/work";

type Choice = { id: string; name: string; slug: string };
type ProjectChoice = { id: string; name: string; slug: string; archived_at: string | null };

export function TaskEditor({
  task,
  agents,
  projects,
  labels,
  links,
  comments,
  activity,
  history,
  subtasks,
  owner,
  parentIdentifier,
}: {
  task: Task;
  agents: Choice[];
  projects: ProjectChoice[];
  labels: string[];
  links: TaskLink[];
  comments: TaskComment[];
  activity: { id: string; actor: string; summary: string; created_at: string }[];
  history: BlockEvent[];
  subtasks: { id: string; identifier: string | null; title: string; status: string }[];
  owner: BlockedAgentRef;
  parentIdentifier: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [comment, setComment] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState("other");
  const [linkLabel, setLinkLabel] = useState("");
  const refs = task.external_refs ?? {};
  const blockEntry = taskBlockedEntry(owner, task, "blocked");
  const resolutions = comments.filter((item) => item.kind === "resolution");
  const notes = comments.filter((item) => item.kind !== "resolution");
  const canPostResolution = task.blocked && !isClosedStatus(task.status);

  async function save(form: FormData) {
    setPending(true);
    setError(null);
    const labelsValue = String(form.get("labels") ?? "");
    const result = await updateWorkTaskAction(task.identifier ?? task.id, {
      title: String(form.get("title") ?? ""),
      details: String(form.get("details") ?? ""),
      status: String(form.get("status") ?? ""),
      priority: String(form.get("priority") ?? ""),
      agent_id: String(form.get("agent_id") ?? ""),
      project: String(form.get("project") ?? ""),
      assignee: String(form.get("assignee") ?? ""),
      due_on: String(form.get("due_on") ?? ""),
      parent: String(form.get("parent") ?? ""),
      labels: labelsValue,
      linear_id: String(form.get("linear_id") ?? ""),
      linear_url: String(form.get("linear_url") ?? ""),
      cloud_agent_id: String(form.get("cloud_agent_id") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="task-detail">
      <form
        className="stack detail-card"
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <div className="task-meta">
          <p className="work-id">{task.identifier}</p>
          {task.resolution_pending ? <AwaitingAgentBadge /> : null}
        </div>
        <label className="field">
          Title
          <input name="title" defaultValue={task.title} required maxLength={200} />
        </label>
        <label className="field">
          Description
          <textarea name="details" defaultValue={task.details ?? ""} rows={6} maxLength={20000} />
        </label>
        <div className="field-row">
          <label className="field">
            Status
            <select name="status" defaultValue={columnStatus(task.status)}>
              {WORK_COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Priority
            <select name="priority" defaultValue={canonicalPriority(task.priority)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Owner
            <select name="agent_id" defaultValue={task.agent_id}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Assignee
            <select name="assignee" defaultValue={task.assignee_herzen ? "herzen" : (agents.find((agent) => agent.id === task.assignee_agent_id)?.slug ?? "")}>
              <option value="">Unassigned</option>
              <option value="herzen">Herzen</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Project
            <select name="project" defaultValue={projects.find((project) => project.id === task.project_id)?.slug ?? ""}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.slug}>
                  {project.name}
                  {project.archived_at ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Due date
            <input name="due_on" type="date" defaultValue={task.due_on ?? ""} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Parent
            <input name="parent" defaultValue={parentIdentifier ?? ""} placeholder="HQ-123" />
          </label>
          <label className="field">
            Labels
            <input name="labels" defaultValue={labels.join(", ")} placeholder="bug, launch" />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Linear id
            <input name="linear_id" defaultValue={refs.linear_id ?? ""} />
          </label>
          <label className="field">
            Cloud agent id
            <input name="cloud_agent_id" defaultValue={refs.cloud_agent_id ?? ""} placeholder="bc-..." />
          </label>
        </div>
        <label className="field">
          Linear URL
          <input name="linear_url" defaultValue={refs.linear_url ?? ""} placeholder="https://" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save task"}
          </button>
        </div>
      </form>
      <div className="stack">
        <section className="detail-card">
          <h2>Links</h2>
          {links.length === 0 ? <p className="empty">No durable links yet.</p> : null}
          <ul className="check-list">
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.url}>{link.label || link.url}</a>
                <span className="quiet-line"> {link.kind}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    void removeTaskLinkAction(link.id).then(() => router.refresh());
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void addTaskLinkAction(task.identifier ?? task.id, { url: linkUrl, kind: linkKind, label: linkLabel }).then((result) => {
                if (!result.ok) setError(result.error);
                else {
                  setLinkUrl("");
                  setLinkLabel("");
                  router.refresh();
                }
              });
            }}
          >
            <div className="field-row">
              <label className="field">
                URL
                <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} required placeholder="https://" />
              </label>
              <label className="field">
                Type
                <select value={linkKind} onChange={(event) => setLinkKind(event.target.value)}>
                  {LINK_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Label
              <input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} />
            </label>
            <button type="submit" className="btn">
              Add link
            </button>
          </form>
        </section>
        <section className="detail-card">
          <h2>Subtasks</h2>
          {subtasks.length === 0 ? <p className="empty">No subtasks.</p> : null}
          <ul className="check-list">
            {subtasks.map((item) => (
              <li key={item.id}>
                <a href={`/work/${item.identifier ?? item.id}`}>
                  {item.identifier} {item.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
        {canPostResolution || resolutions.length > 0 ? (
          <section className="detail-card">
            <h2>Resolution</h2>
            <ResolutionBox
              taskId={task.id}
              resolutions={resolutions.map((item) => ({
                id: item.id,
                author: item.author,
                body: item.body,
                created_at: item.created_at,
              }))}
              state={task.resolution_state ?? (task.resolution_pending ? "awaiting_agent" : "none")}
              acknowledgedAt={task.resolution_acknowledged_at ?? null}
              canPost={canPostResolution}
            />
          </section>
        ) : null}
        <section className="detail-card">
          <h2>Blocked</h2>
          {task.blocked ? (
            <button type="button" className="blocked-note blocked-note-btn" onClick={() => setShowBlock(true)}>
              <span>{task.blocked_note || task.blocked_reason || "This task is blocked."}</span>
              <span className="view-block">View block details</span>
            </button>
          ) : (
            <p className="empty">Not blocked. Block fields clear when the block ends. The history stays.</p>
          )}
          <ul className="check-list">
            {history.map((event) => (
              <li key={event.id}>
                <span>
                  {event.action} · {personName(event.actor, agents)} · {formatCancunTimestamp(event.created_at) ?? event.created_at}
                </span>
                {event.waiting_on ? <span className="quiet-line"> Waiting on {event.waiting_on}</span> : null}
              </li>
            ))}
          </ul>
        </section>
        <section className="detail-card">
          <h2>Comments</h2>
          {notes.length === 0 ? <p className="empty">No comments yet.</p> : null}
          <ul className="check-list">
            {notes.map((item) => (
              <li key={item.id}>
                <strong>{personName(item.author, agents)}</strong> {item.body}
                <div className="quiet-line">{formatCancunTimestamp(item.created_at)}</div>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void commentOnTaskAction(task.identifier ?? task.id, comment).then((result) => {
                if (!result.ok) setError(result.error);
                else {
                  setComment("");
                  router.refresh();
                }
              });
            }}
          >
            <label className="field">
              Comment as Herzen
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={8000} required />
            </label>
            <button type="submit" className="btn btn-primary">
              Comment
            </button>
          </form>
        </section>
        <section className="detail-card">
          <h2>Activity</h2>
          {activity.length === 0 ? <p className="empty">No activity yet.</p> : null}
          <ol className="check-list">
            {activity.map((item) => (
              <li key={item.id}>
                <strong>{personName(item.actor, agents)}</strong> {item.summary}
                <div className="quiet-line">{formatCancunTimestamp(item.created_at)}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {showBlock && blockEntry ? (
        <BlockedDetailModal entries={[blockEntry]} heading={`${owner.name} is blocked`} onClose={() => setShowBlock(false)} />
      ) : null}
    </div>
  );
}
