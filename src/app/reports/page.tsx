import { ActivityPanel } from "@/components/activity-panel";
import { DatePicker } from "@/components/date-picker";
import { LiveAvatar } from "@/components/live-status";
import { Shell, Split } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { listReports } from "@/lib/data";
import { etTodayISO, formatEtTime, isIsoDate } from "@/lib/time";

export const dynamic = "force-dynamic";

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const requested = params.date && isIsoDate(params.date) ? params.date : etTodayISO();
  const chrome = await loadChrome();
  const reports = await listReports(requested);
  const byAgent = new Map(reports.map((report) => [report.agent_id, report]));
  const posted = chrome.agents.filter((agent) => byAgent.has(agent.id)).length;

  return (
    <Shell active="reports" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <div className="page-head">
        <div>
          <p className="dateline">America/New_York</p>
          <h1 className="greeting page-title">Reports</h1>
          <p className="subhead">
            {posted}/{chrome.agents.length} posted
            {chrome.agents.length - posted > 0 ? <span className="stuck-word">, {chrome.agents.length - posted} missing</span> : null}
          </p>
        </div>
        <DatePicker date={requested} />
      </div>
      <Split
        main={
          <section className="report-grid" aria-label="Daily reports">
            {chrome.agents.map((agent) => {
              const report = byAgent.get(agent.id);
              const mood = chrome.moods.get(agent.id) ?? "idle";
              const done = lines(report?.done);
              const inProgress = lines(report?.in_progress);
              const blocked = lines(report?.blocked);
              return (
                <article key={agent.id} className={report ? "report-card" : "report-card is-missing"}>
                  <header className="report-head">
                    <LiveAvatar name={agent.name} agentId={agent.id} fallback={mood} size={44} />
                    <div>
                      <h2>{agent.name}</h2>
                      <p>{agent.role}</p>
                    </div>
                    {report ? (
                      <span className="quiet-line">Posted {formatEtTime(new Date(report.posted_at))}</span>
                    ) : (
                      <span className="missing-pill">Missing</span>
                    )}
                  </header>
                  {report ? (
                    <div className="report-cols">
                      <ReportList title="Done today" items={done} />
                      <ReportList title="In progress" items={inProgress} />
                      <ReportList title="Blocked" items={blocked} warn />
                    </div>
                  ) : (
                    <p className="empty">No report posted for this date.</p>
                  )}
                </article>
              );
            })}
          </section>
        }
        side={<ActivityPanel items={chrome.activity} />}
      />
    </Shell>
  );
}

function ReportList({ title, items, warn = false }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <section className={warn ? "report-col warn" : "report-col"}>
      <h3>
        {title} <span>{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="quiet-line">None</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
