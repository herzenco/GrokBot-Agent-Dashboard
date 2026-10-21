import Link from "next/link";
import { ActivityPanel } from "@/components/activity-panel";
import { CheckIcon } from "@/components/icons";
import { LiveAgentNow, LiveAvatar, LiveBubbles, LiveIndicator, LiveMoodPill, LiveSummary } from "@/components/live-status";
import { Shell, Split } from "@/components/shell";
import { tileVar } from "@/lib/avatar-model";
import { loadBoard } from "@/lib/chrome";
import { etHour, formatEtDateline, greetingForHour } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const now = new Date();
  const { agents, cards, stats, activity, live } = await loadBoard(now);

  return (
    <Shell active="board" agents={agents} live={live} activity={activity}>
      <p className="dateline">{formatEtDateline(now)}</p>
      <h1 className="greeting">{greetingForHour(etHour(now))}, Tito.</h1>
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
        <div className="stat">
          <span className="stat-label bad">Blocked</span>
          <span className="stat-value bad">{stats.blocked}</span>
        </div>
        <Link href="/reports" className="stat stat-link">
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
        </Link>
      </section>

      <Split
        main={
          <section className="agent-grid" aria-label="Agents">
            {cards.map((card) => {
              const shown = card.doneToday.slice(0, 3);
              const extra = card.doneCount - shown.length;
              return (
                <Link key={card.agent.id} href={`/agents/${card.agent.slug}`} className="card">
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
                      <span className={card.reportPosted ? "" : "missing"}>{card.reportLabel}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        }
        side={<ActivityPanel items={activity} />}
      />
    </Shell>
  );
}
