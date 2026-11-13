import { MyTasks } from "@/components/my-tasks";
import { Shell } from "@/components/shell";
import { WorkViewSwitch } from "@/components/work-view-switch";
import { loadChrome } from "@/lib/chrome";
import { selectMyTasks } from "@/lib/my-tasks";
import { etTodayISO } from "@/lib/time";
import { listProjects } from "@/lib/work-db";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const now = new Date();
  const [chrome, projects] = await Promise.all([loadChrome(now), listProjects()]);
  const selection = selectMyTasks(chrome.tasks, chrome.agents, etTodayISO(now), projects);

  return (
    <Shell active="mine" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <p className="dateline">My tasks</p>
      <h1 className="greeting">My tasks</h1>
      <p className="subhead">Open tasks assigned to you, or blocked and waiting on you. Due dates are Eastern Time.</p>
      <WorkViewSwitch view="mine" mineHref="/work/me" boardHref="/work?view=board" listHref="/work?view=list" />
      <MyTasks selection={selection} />
    </Shell>
  );
}
