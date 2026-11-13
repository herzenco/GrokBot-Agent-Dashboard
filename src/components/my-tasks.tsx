import Link from "next/link";
import { BlockedLaunch } from "@/components/blocked-detail-modal";
import { AwaitingAgentBadge } from "@/components/resolution-box";
import type { BlockedEntry } from "@/lib/blocked";
import type { MyTaskSelection } from "@/lib/my-tasks";

export function MyTasks({
  selection,
  entries = {},
}: {
  selection: MyTaskSelection;
  entries?: Record<string, BlockedEntry>;
}) {
  return (
    <section className="my-tasks" aria-label="My tasks">
      <p className="my-task-count">{selection.summary}</p>
      {selection.count === 0 ? (
        <p className="empty">No open tasks are assigned to you or waiting on you.</p>
      ) : (
        <div className="my-task-groups">
          {selection.groups.map((group) => (
            <section key={group.agentId} className="my-task-group" aria-labelledby={`my-tasks-${group.agentId}`}>
              <h2 id={`my-tasks-${group.agentId}`}>
                {group.agentName}
                <span className="my-task-group-count">{group.tasks.length}</span>
              </h2>
              <ul className="my-task-list">
                {group.tasks.map((task) => {
                  const entry = entries[task.id];
                  return (
                    <li key={task.id}>
                      <div className="my-task-shell">
                        <Link href={task.href} className="my-task">
                          <span className="work-id">{task.identifier ?? "Task"}</span>
                          <h3 className="my-task-title">{task.title}</h3>
                          <div className="my-task-meta">
                            <span>{task.statusLabel}</span>
                            <span className={`pri pri-${task.priority}`}>{task.priorityLabel}</span>
                            <span>{task.projectName ?? "No project"}</span>
                            {task.assigned ? <span className="pri">Assigned to you</span> : null}
                            {task.waiting ? <span className="blocked-badge">Waiting on you</span> : null}
                            {task.resolutionPending ? <AwaitingAgentBadge /> : null}
                            <span className={task.overdue ? "my-task-overdue" : undefined}>
                              {task.dueLabel ? `${task.overdue ? "Overdue ·" : "Due"} ${task.dueLabel}` : "No due date"}
                            </span>
                          </div>
                          {task.blockedReason ? <p className="my-task-reason">Blocked: {task.blockedReason}</p> : null}
                        </Link>
                        {entry ? (
                          <BlockedLaunch
                            className="btn my-task-resolve"
                            entries={[entry]}
                            heading={`${entry.agentName} is blocked`}
                          >
                            Resolution
                          </BlockedLaunch>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
