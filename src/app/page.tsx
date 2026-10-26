import Link from "next/link";
import { ActivityPanel } from "@/components/activity-panel";
import { BlockedLaunch, BlockedStatButton } from "@/components/blocked-detail-modal";
import { CheckIcon } from "@/components/icons";
import { LiveAgentNow, LiveAvatar, LiveBubbles, LiveIndicator, LiveMoodPill, LiveSummary } from "@/components/live-status";
import { Shell, Split } from "@/components/shell";
import { tileVar } from "@/lib/avatar-model";
import { collectBlockedEntries } from "@/lib/blocked";
import { loadBoard } from "@/lib/chrome";
import { etHour, formatEtDateline, formatIsoMonthDay, greetingForHour } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const now = new Date();
  const { agents, cards, stats, activity, live, tasks, moods } = await loadBoard(now);
  const blockedEntries = collectBlockedEntries({ agents, tasks, live, moods });

  return (
    <Shell active="board" agents={agents} live={live} activity={activity}>
      <p className="dateline">{formatEtDateline(now)}</p>
      <h1 className="greeting">{greetingForHour(etHour(now))}, Herzen.</h1>
      <div className="live-bar">
        <LiveSummary />
        <LiveIndicator />
      </div>
      <section className="stats" aria-label="Summary">
        <div className="stat">
          <span className="stat-label">To do</span>
          <span className="stat-value">{stats.todo}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Doing</span>
          <span className="stat-value">{stats.doing}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Done today</span>
          <span className="stat-value good">{stats.doneToday}</span>
        </div>
        <BlockedStatButton count={stats.blocked} entries={blockedEntries} />
        <Link href="/reports" className="stat stat-link">
          {stats.reportsPosted === 0 && stats.latestReportDate ? (
            <>
              <span className="stat-top">
                Reports posted
                <span className="stuck-word">none yet today</span>
              </span>
              <span className="stat-bottom">
                <span className="stat-latest-line">
                  0/{agents.length} today · Latest: {stats.latestReportsPosted} on {formatIsoMonthDay(stats.latestReportDate)}
                </span>
                <span className="faces">
                  {cards.map((card) => (
                    <span key={card.agent.id} style={{ opacity: card.reportTone === "missing" ? 0.3 : 1 }}>
                      <LiveAvatar name={card.agent.name} agentId={card.agent.id} fallback={card.mood} size={20} />
                    </span>
                  ))}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="stat-top">
                Reports posted
                {stats.reportsMissing > 0 ? <span className="stuck-word">{stats.reportsMissing} missing</span> : <span>all in</span>}
              </span>
              <span className="stat-bottom">
                <span className="stat-value">
                  {stats.reportsPosted}
                  <span className="stat-of">/{agents.length}</span>
                </span>
                <span className="faces">
                  {cards.map((card) => (
                    <span key={card.agent.id} style={{ opacity: card.reportPosted ? 1 : 0.3 }}>
                      <LiveAvatar name={card.agent.name} agentId={card.agent.id} fallback={card.mood} size={20} />
                    </span>
                  ))}
                </span>
              </span>
            </>
          )}
        </Link>
      </section>

      <Split
        main={
          <section className="agent-grid" aria-label="Agents">
            {cards.map((card) => {
              const shown = card.doneToday.slice(0, 3);
              const extra = card.doneCount - shown.length;
              const blocks = blockedEntries.filter((entry) => entry.agentId === card.agent.id);
              return (
                <article key={card.agent.id} className="card">
                  <Link href={`/agents/${card.agent.slug}`} className="card-fill">
                  <div className="card-head" style={{ background: tileVar(card.agent.name) }}>
                    <LiveAvatar name={card.agent.name} agentId={card.agent.id} fallback={card.mood} size={60} />
                    <div className="card-id">
                      <div className="card-name">{card.agent.name}</div>
                      <div className="card-role">{card.agent.role}</div>
                    </div>
                    <LiveMoodPill agentId={card.agent.id} fallback={card.mood} />
                  </div>
                  <div className="card-body">
                    <LiveAgentNow agentId={card.agent.id} />
                    <LiveBubbles agentId={card.agent.id} todo={card.todo} fallback={card.bubbles} />
                    <div className="done-block">
                      <span className="done-label">
                        Done today <span className="done-count">{card.doneCount}</span>
                      </span>
                      <ul className="check-list">
                        {shown.map((title) => (
                          <li key={title}>
                            <CheckIcon />
                            <span>{title}</span>
                          </li>
                        ))}
                        {extra > 0 ? <li className="more">+{extra} more</li> : null}
                        {card.doneCount === 0 ? <li className="quiet-line">Nothing yet</li> : null}
                      </ul>
                    </div>
                    <div className="card-foot">
                      <span>
                        {card.todo} to do
                      </span>
                      <span className={card.reportTone === "missing" ? "missing" : card.reportTone === "latest" ? "report-latest" : ""}>
                        {card.reportLabel}
                      </span>
                    </div>
                  </div>
                  </Link>
                  {blocks.length > 0 ? (
                    <div className="card-block-bar">
                      <BlockedLaunch className="blocked-launch" entries={blocks} heading={`${card.agent.name} is blocked`}>
                        Blocked · view details
                      </BlockedLaunch>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        }
        side={<ActivityPanel items={activity} />}
      />
    </Shell>
  );
}
