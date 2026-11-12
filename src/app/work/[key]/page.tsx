import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskEditor } from "@/components/task-editor";
import { Shell } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { findTaskByKey, listBlockEvents, listComments, listProjects, listSubtasks, listTaskActivity, listTaskLinks, taskLabelNames } from "@/lib/work-db";

export const dynamic = "force-dynamic";

export default async function WorkTaskPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [chrome, task] = await Promise.all([loadChrome(), findTaskByKey(key)]);
  if (!task) notFound();
  const owner = chrome.agents.find((agent) => agent.id === task.agent_id);
  if (!owner) notFound();
  const [projects, labelMap, links, comments, activity, history, subtasks, parent] = await Promise.all([
    listProjects(),
    taskLabelNames([task.id]),
    listTaskLinks(task.id),
    listComments(task.id),
    listTaskActivity(task.id),
    listBlockEvents(task.id),
    listSubtasks(task.id),
    task.parent_id ? findTaskByKey(task.parent_id) : Promise.resolve(null),
  ]);

  return (
    <Shell active="work" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <p className="dateline">
        <Link href="/work">Work</Link>
        <span aria-hidden="true"> / </span>
        {task.identifier ?? "Task"}
      </p>
      <h1 className="greeting queue-title">{task.title}</h1>
      <TaskEditor
        task={task}
        agents={chrome.agents}
        projects={projects}
        labels={labelMap.get(task.id) ?? []}
        links={links}
        comments={comments}
        activity={activity.map((row) => ({
          id: String(row.id),
          actor: String(row.actor),
          summary: String(row.summary),
          created_at: String(row.created_at),
        }))}
        history={history}
        subtasks={subtasks.map((item) => ({
          id: item.id,
          identifier: item.identifier ?? null,
          title: item.title,
          status: item.status,
        }))}
        owner={{ id: owner.id, name: owner.name, slug: owner.slug, role: owner.role }}
        parentIdentifier={parent?.identifier ?? null}
      />
    </Shell>
  );
}
