import { ActivityPanel } from "@/components/activity-panel";
import { OutreachBoard } from "@/components/outreach-board";
import { Shell, Split } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { listOutreach } from "@/lib/data";
import { toOutreachView } from "@/lib/outreach";

export default async function OutreachPage() {
  const [chrome, rows] = await Promise.all([loadChrome(), listOutreach()]);
  const byId = new Map(chrome.agents.map((agent) => [agent.id, agent]));
  const items = rows.map((row) => toOutreachView(row, byId.get(row.agent_id)));

  return (
    <Shell active="outreach" agents={chrome.agents}>
      <p className="dateline">Prospecting</p>
      <h1 className="greeting page-title">Outreach</h1>
      <p className="subhead">Who was contacted, and whether they replied. Hondo logs these from the agent API.</p>
      <Split
        main={<OutreachBoard initial={items} agents={chrome.agents} />}
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}
