import Link from "next/link";
import { ActivityPanel } from "@/components/activity-panel";
import { Avatar } from "@/components/avatar";
import { CheckIcon } from "@/components/icons";
import { LiveAgentNow, LiveIndicator, LiveStatusProvider, LiveSummary } from "@/components/live-status";
import { Shell, Split } from "@/components/shell";
import { tileVar } from "@/lib/avatar-model";
import { statusLabel } from "@/lib/board";
import { loadBoard } from "@/lib/chrome";
import { listAgentStatus } from "@/lib/data";
import { presentLiveStatus } from "@/lib/live";
import { etHour, formatEtDateline, greetingForHour } from "@/lib/time";

export default async function BoardPage() {
  const now = new Date();
  const [{ agents, cards, stats, activity }, statuses] = await Promise.all([loadBoard(now), listAgentStatus()]);
  const live = presentLiveStatus(agents, statuses, now);
  const workingWord = stats.working === 1 ? "agent" : "agents";

  return (
    <Shell active="board" agents={agents}>
      <p className="dateline">{formatEtDateline(now)}</p>
      <h1 className="greeting">{greetingForHour(etHour(now))}, Tito.</h1>
      <p className="subhead board-subhead">
        {stats.working} {workingWord} working, <span className="stuck-word">{stats.stuck} stuck</span>, {stats.napping} napping.
      </p>
      <LiveStatusProvider initial={live} initialActivity={activity}>
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
                    <Avatar name={card.agent.name} mood={card.mood} size={20} />
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
                      <Avatar name={card.agent.name} mood={card.mood} size={60} />
                      <div className="card-id">
                        <div className="card-name">{card.agent.name}</div>
                        <div className="card-role">{card.agent.role}</div>
                      </div>
                      <span className={`pill pill-${card.mood}`}>
                        <span className="pill-dot" aria-hidden="true" />
                        {statusLabel(card.mood)}
                      </span>
                    </div>
                    <div className="card-body">
                      <LiveAgentNow agentId={card.agent.id} />
                      <div className="bubbles">
                        {card.bubbles.map((bubble, index) => (
                          <div key={`${bubble.kind}-${bubble.label}`} className={`bubble bubble-${bubble.kind}`} data-tail={index === 0 ? "yes" : "no"}>
                            <div className="bubble-label">{bubble.label}</div>
                            {bubble.lines.map((line) => (
                              <div key={line} className="bubble-line">
                                {line}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
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
      </LiveStatusProvider>
    </Shell>
  );
}
