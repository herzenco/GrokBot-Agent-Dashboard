"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWorkTaskAction } from "@/app/work-actions";
import { PRIORITY_OPTIONS, WORK_COLUMNS } from "@/lib/work";

type Choice = { id: string; name: string; slug: string };
type ProjectChoice = { id: string; name: string; slug: string };

export function WorkCreate({
  agents,
  projects,
}: {
  agents: Choice[];
  projects: ProjectChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        New work task
      </button>
    );
  }

  return (
    <form
      className="stack detail-card"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        void createWorkTaskAction({
          title: String(form.get("title") ?? ""),
          details: String(form.get("details") ?? ""),
          agentId: String(form.get("agentId") ?? ""),
          priority: String(form.get("priority") ?? "medium"),
          status: String(form.get("status") ?? "todo"),
          project: String(form.get("project") ?? ""),
          assignee: String(form.get("assignee") ?? ""),
          dueOn: String(form.get("dueOn") ?? ""),
          labels: String(form.get("labels") ?? ""),
          parent: String(form.get("parent") ?? ""),
        }).then((result) => {
          setPending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <h2>New task</h2>
      <label className="field">
        Title
        <input name="title" required maxLength={200} autoFocus />
      </label>
      <label className="field">
        Description
        <textarea name="details" rows={3} maxLength={20000} />
      </label>
      <div className="field-row">
        <label className="field">
          Owner
          <select name="agentId" required defaultValue={agents[0]?.id ?? ""}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Assignee
          <select name="assignee" defaultValue="">
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
          Status
          <select name="status" defaultValue="todo">
            {WORK_COLUMNS.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Priority
          <select name="priority" defaultValue="medium">
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
          Project
          <select name="project" defaultValue="">
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Due date
          <input name="dueOn" type="date" />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Labels
          <input name="labels" placeholder="bug, launch" />
        </label>
        <label className="field">
          Parent
          <input name="parent" placeholder="HQ-123" />
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Add task"}
        </button>
      </div>
    </form>
  );
}
