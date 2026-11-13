"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTaskStatusAction } from "@/app/actions";
import { AwaitingAgentBadge } from "@/components/resolution-box";
import { formatCancunTimestamp } from "@/lib/time";
import type { TaskStatus } from "@/lib/types";
import { WORK_COLUMNS, canonicalPriority, columnStatus, type CanonicalStatus } from "@/lib/work";

export type WorkCard = {
  id: string;
  identifier: string | null;
  title: string;
  status: TaskStatus;
  priority: string;
  blocked: boolean;
  agentName: string;
  projectName: string | null;
  dueOn: string | null;
  labels: string[];
  updatedAt: string;
  resolutionPending?: boolean;
};

export function WorkBoard({ tasks }: { tasks: WorkCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState<CanonicalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  function move(id: string, status: CanonicalStatus) {
    const task = tasks.find((item) => item.id === id);
    if (!task || columnStatus(task.status) === status) return;
    startTransition(async () => {
      const result = await setTaskStatusAction(id, status);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="queue queue-wide" aria-label="Tasks by status">
        {WORK_COLUMNS.map((column) => {
          const items = tasks.filter((task) => columnStatus(task.status) === column.status);
          return (
            <section
              key={column.status}
              className={over === column.status ? "queue-col is-over" : "queue-col"}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(column.status);
              }}
              onDragLeave={() => setOver((current) => (current === column.status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                move(event.dataTransfer.getData("text/plain"), column.status);
              }}
            >
              <header className="queue-col-head">
                <h2>{column.label}</h2>
                <span>{items.length}</span>
              </header>
              <div className="queue-cards">
                {items.length === 0 ? <p className="empty">Nothing here</p> : null}
                {items.map((task) => (
                  <article
                    key={task.id}
                    className="task"
                    draggable={!pending}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <p className="work-id">{task.identifier}</p>
                    <h3 className="task-title">
                      <Link href={`/work/${task.identifier ?? task.id}`}>{task.title}</Link>
                    </h3>
                    <div className="task-meta">
                      <span className={`pri pri-${canonicalPriority(task.priority)}`}>{canonicalPriority(task.priority)}</span>
                      <span>{task.agentName}</span>
                      {task.projectName ? <span>{task.projectName}</span> : null}
                      {task.blocked ? <span className="blocked-badge">Blocked</span> : null}
                      {task.resolutionPending ? <AwaitingAgentBadge /> : null}
                    </div>
                    {task.labels.length ? <p className="quiet-line">{task.labels.join(", ")}</p> : null}
                    <p className="quiet-line">
                      {task.dueOn ? `Due ${task.dueOn}` : "No due date"}
                      {formatCancunTimestamp(task.updatedAt) ? ` · ${formatCancunTimestamp(task.updatedAt)}` : ""}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function WorkList({ tasks }: { tasks: WorkCard[] }) {
  if (tasks.length === 0) return <p className="empty">No tasks match these filters.</p>;
  return (
    <div className="work-table-wrap">
      <table className="work-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Owner</th>
            <th>Project</th>
            <th>Due</th>
            <th>Labels</th>
            <th>Blocked</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="work-id">{task.identifier}</td>
              <td>
                <Link href={`/work/${task.identifier ?? task.id}`}>{task.title}</Link>
              </td>
              <td>{WORK_COLUMNS.find((column) => column.status === columnStatus(task.status))?.label}</td>
              <td>{canonicalPriority(task.priority)}</td>
              <td>{task.agentName}</td>
              <td>{task.projectName ?? "—"}</td>
              <td>{task.dueOn ?? "—"}</td>
              <td>{task.labels.join(", ") || "—"}</td>
              <td>
                {task.blocked ? "Yes" : "No"}
                {task.resolutionPending ? (
                  <>
                    {" "}
                    <AwaitingAgentBadge />
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
