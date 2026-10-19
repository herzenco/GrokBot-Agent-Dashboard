"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reassignTaskAction, setTaskBlockedAction, setTaskPriorityAction, setTaskStatusAction } from "@/app/actions";
import type { ShellAgent } from "@/components/shell";
import { ageLabel } from "@/lib/time";
import type { Priority, Task, TaskStatus } from "@/lib/types";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "Doing" },
  { status: "done", label: "Done" },
];

export function QueueBoard({ tasks, agents }: { tasks: Task[]; agents: ShellAgent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="queue-wrap">
      {error ? <p className="form-error">{error}</p> : null}
      <div className="queue">
        {COLUMNS.map((column) => {
          const items = tasks.filter((task) => task.status === column.status);
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
                const id = event.dataTransfer.getData("text/plain");
                const task = tasks.find((item) => item.id === id);
                if (!task || task.status === column.status) return;
                run(() => setTaskStatusAction(id, column.status));
              }}
            >
              <header className="queue-col-head">
                <h2>{column.label}</h2>
                <span>{items.length}</span>
              </header>
              <div className="queue-cards">
                {items.length === 0 ? <p className="empty">Nothing here</p> : null}
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    agents={agents}
                    pending={pending}
                    onStatus={(status) => run(() => setTaskStatusAction(task.id, status))}
                    onPriority={(priority) => run(() => setTaskPriorityAction(task.id, priority))}
                    onReassign={(agentId) => run(() => reassignTaskAction(task.id, agentId))}
                    onBlock={(blocked, note) => run(() => setTaskBlockedAction(task.id, blocked, note))}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  agents,
  pending,
  onStatus,
  onPriority,
  onReassign,
  onBlock,
}: {
  task: Task;
  agents: ShellAgent[];
  pending: boolean;
  onStatus: (status: TaskStatus) => void;
  onPriority: (priority: Priority) => void;
  onReassign: (agentId: string) => void;
  onBlock: (blocked: boolean, note: string) => void;
}) {
  const [note, setNote] = useState(task.blocked_note ?? "");
  const [blocking, setBlocking] = useState(false);

  return (
    <article
      className="task"
      onDragStart={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, select, textarea, input, a, label")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <h3 className="task-title" draggable>
        {task.title}
      </h3>
      {task.details ? <p className="task-details">{task.details}</p> : null}
      <div className="task-meta">
        <span className={`pri pri-${task.priority}`}>{task.priority}</span>
        <span className="age">{ageLabel(task.created_at)}</span>
        {task.blocked ? <span className="blocked-badge">Blocked</span> : null}
      </div>
      {task.blocked && task.blocked_note ? <p className="blocked-note">{task.blocked_note}</p> : null}
      <div className="seg" role="group" aria-label="Status">
        {COLUMNS.map((column) => (
          <button
            key={column.status}
            type="button"
            aria-pressed={task.status === column.status}
            disabled={pending || task.status === column.status}
            onClick={() => onStatus(column.status)}
          >
            {column.label}
          </button>
        ))}
      </div>
      <div className="task-selects">
        <label>
          Priority
          <select
            value={task.priority}
            disabled={pending}
            onChange={(event) => onPriority(event.target.value as Priority)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Agent
          <select value={task.agent_id} disabled={pending} onChange={(event) => onReassign(event.target.value)}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {task.blocked ? (
        <button type="button" className="text-btn" disabled={pending} onClick={() => onBlock(false, "")}>
          Clear block
        </button>
      ) : blocking ? (
        <form
          className="block-form"
          onSubmit={(event) => {
            event.preventDefault();
            onBlock(true, note);
            setBlocking(false);
          }}
        >
          <label>
            What is stuck?
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} required maxLength={1000} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setBlocking(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              Mark blocked
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="text-btn" disabled={pending} onClick={() => setBlocking(true)}>
          Mark blocked
        </button>
      )}
    </article>
  );
}
