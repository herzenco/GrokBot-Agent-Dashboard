import Link from "next/link";
import { ActivityPanel } from "@/components/activity-panel";
import { DatePicker } from "@/components/date-picker";
import { LiveAvatar } from "@/components/live-status";
import { ReportBlockedColumn } from "@/components/report-blocked";
import { Shell, Split } from "@/components/shell";
import { loadChrome } from "@/lib/chrome";
import { listLatestReportsByAgent, listReportDates, listReports } from "@/lib/data";
import { resolveReportDate } from "@/lib/reports-view";
import { formatEtTime, formatIsoMonthDay, formatIsoWeekday, isIsoDate } from "@/lib/time";

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
  const chrome = await loadChrome();
  const today = chrome.date;
  const explicit = params.date && isIsoDate(params.date) ? params.date : null;
  const [dates, latestRows, preview] = await Promise.all([
    listReportDates(),
    listLatestReportsByAgent(),
    listReports(explicit ?? today),
  ]);
  const choice = explicit
    ? resolveReportDate({ explicit, today, todayCount: preview.length, dates })
    : resolveReportDate({ explicit: null, today, todayCount: preview.length, dates });
  const effectiveDate = choice.effectiveDate;
  const showingLatest = choice.showingLatest;
  const reports = effectiveDate === (explicit ?? today) ? preview : await listReports(effectiveDate);
  const byAgent = new Map(reports.map((report) => [report.agent_id, report]));
  const latestByAgent = new Map(latestRows.map((report) => [report.agent_id, report]));
  const posted = chrome.agents.filter((agent) => byAgent.has(agent.id)).length;
  const recent = [today, ...dates.filter((date) => date !== today)].slice(0, 8);

  return (
    <Shell active="reports" agents={chrome.agents} live={chrome.live} activity={chrome.activity}>
      <div className="page-head">
        <div>
          <p className="dateline">America/New_York</p>
          <h1 className="greeting page-title">Reports</h1>
          <p className="subhead">
            {formatIsoWeekday(effectiveDate)} · {posted}/{chrome.agents.length} posted
            {chrome.agents.length - posted > 0 ? <span className="stuck-word">, {chrome.agents.length - posted} missing</span> : null}
          </p>
        </div>
        <div className="report-tools">
          <nav className="date-pills" aria-label="Recent report dates">
            {recent.map((date) => {
              const current = date === effectiveDate;
              return (
                <Link
                  key={date}
                  href={`/reports?date=${date}`}
                  className={current ? "date-pill is-on" : "date-pill"}
                  aria-current={current ? "date" : undefined}
                >
                  {date === today ? "Today" : formatIsoMonthDay(date)}
                </Link>
              );
            })}
          </nav>
          <DatePicker date={effectiveDate} />
        </div>
      </div>
      {showingLatest ? (
        <div className="report-note">
          <p>
            Showing latest reports from {formatIsoWeekday(effectiveDate)} (0 posted yet for today, {formatIsoWeekday(today)})
          </p>
          <Link href={`/reports?date=${today}`} className="date-pill">
            View today
          </Link>
        </div>
      ) : null}
      <Split
        main={
          <section className="report-grid" aria-label="Daily reports">
            {chrome.agents.map((agent) => {
              const report = byAgent.get(agent.id);
              const prior = latestByAgent.get(agent.id);
              const priorOther = prior && prior.report_date !== effectiveDate ? prior : null;
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
                      <ReportBlockedColumn
                        items={blocked}
                        agent={{ id: agent.id, name: agent.name, slug: agent.slug, role: agent.role }}
                        mood={mood}
                        reportDate={effectiveDate}
                      />
                    </div>
                  ) : priorOther ? (
                    <p className="empty">
                      No report for this date · Latest:{" "}
                      <Link className="latest-link" href={`/reports?date=${priorOther.report_date}`}>
                        {formatIsoMonthDay(priorOther.report_date)}
                      </Link>
                    </p>
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

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-col">
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
