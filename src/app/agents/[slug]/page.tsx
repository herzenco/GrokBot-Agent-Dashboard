import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/activity-panel";
import { LiveAvatar, LiveMoodPill } from "@/components/live-status";
import { QueueBoard } from "@/components/queue-board";
import { Shell, Split } from "@/components/shell";
import { tileVar } from "@/lib/avatar-model";
import { loadChrome } from "@/lib/chrome";
import type { Priority, Task, TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function sortQueue(tasks: Task[]): Task[] {
  const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
  const column = (status: TaskStatus) =>
    tasks
      .filter((task) => task.status === status)
      .sort((a, b) => {
        if (status === "done") return (b.done_at ?? "").localeCompare(a.done_at ?? "");
        const priority = rank[a.priority] - rank[b.priority];
        if (priority !== 0) return priority;
        return a.created_at.localeCompare(b.created_at);
      });
  return [...column("todo"), ...column("doing"), ...column("done")];
}

export default async function AgentQueuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chrome = await loadChrome();
  const agent = chrome.agents.find((item) => item.slug === slug);
  if (!agent) notFound();
  const tasks = sortQueue(chrome.tasks.filter((task) => task.agent_id === agent.id));
  const mood = chrome.moods.get(agent.id) ?? "idle";
  const counts = (status: TaskStatus) => tasks.filter((task) => task.status === status).length;

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
            <LiveMoodPill agentId={agent.id} fallback={mood} />
          </p>
          <p className="quiet-line">
            {counts("todo")} to do, {counts("doing")} doing, {counts("done")} done. Drag a title into a column, or use the buttons.
          </p>
        </div>
      </div>
      <Split
        main={<QueueBoard tasks={tasks} agents={chrome.agents} />}
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}
