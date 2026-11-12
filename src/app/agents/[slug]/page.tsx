import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { ClickableMoodPill } from "@/components/blocked-live";
import { LiveAvatar } from "@/components/live-status";
import { QueueBoard } from "@/components/queue-board";
import { Shell, Split } from "@/components/shell";
import { tileVar } from "@/lib/avatar-model";
import { collectBlockedEntries } from "@/lib/blocked";
import { loadChrome } from "@/lib/chrome";
import type { Task } from "@/lib/types";
import { WORK_COLUMNS, columnStatus, priorityRank, type CanonicalStatus } from "@/lib/work";

export const dynamic = "force-dynamic";

function sortQueue(tasks: Task[]): Task[] {
  const column = (status: CanonicalStatus) =>
    tasks
      .filter((task) => columnStatus(task.status) === status)
      .sort((a, b) => {
        if (status === "done") return (b.done_at ?? "").localeCompare(a.done_at ?? "");
        const priority = priorityRank(a.priority) - priorityRank(b.priority);
        if (priority !== 0) return priority;
        return a.created_at.localeCompare(b.created_at);
      });
  return WORK_COLUMNS.flatMap((item) => column(item.status));
}

export default async function AgentQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chrome = await loadChrome();
  const agent = chrome.agents.find((item) => item.slug === slug);
  if (!agent) notFound();
  const tasks = sortQueue(chrome.tasks.filter((task) => task.agent_id === agent.id));
  const mood = chrome.moods.get(agent.id) ?? "idle";
  const blocks = collectBlockedEntries({
    agents: chrome.agents,
    tasks: chrome.tasks,
    live: chrome.live,
    moods: chrome.moods,
  }).filter((entry) => entry.agentId === agent.id);
  const counts = (status: CanonicalStatus) => tasks.filter((task) => columnStatus(task.status) === status).length;

  return (
    <Shell active="board" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <p className="dateline">
        <Link href="/">Board</Link>
        <span aria-hidden="true"> / </span>
        {agent.name}
      </p>
      <div className="queue-intro">
        <div className="queue-person" style={{ background: tileVar(agent.name) }}>
          <LiveAvatar name={agent.name} agentId={agent.id} fallback={mood} size={64} />
        </div>
        <div>
          <h1 className="greeting queue-title">{agent.name}</h1>
          <p className="subhead">
            {agent.role}
            <ClickableMoodPill
              agentId={agent.id}
              fallback={mood}
              blockedEntries={blocks}
              heading={`${agent.name} is blocked`}
            />
          </p>
          <p className="quiet-line">
            {counts("backlog")} backlog, {counts("todo")} to do, {counts("in_progress")} in progress, {counts("in_review")} in review, {counts("done")} done, {counts("canceled")} canceled. Drag a title into a column, or use the buttons.{" "}
            <Link href={`/work?agent=${agent.slug}`}>Open in Work</Link>
          </p>
        </div>
      </div>
      <Split
        main={<QueueBoard tasks={tasks} agents={chrome.agents} owner={agent} mood={mood} />}
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}
