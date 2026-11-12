"use client";

import { BlockedLaunch } from "@/components/blocked-detail-modal";
import { useLiveBoard } from "@/components/live-status";
import { bubblesForLive, statusLabel, type Bubble } from "@/lib/board";
import { agentBlockedEntry, type BlockedEntry } from "@/lib/blocked";
import { livePillMood, liveStatusLabel, presenceTimeLabel, type LiveAgentView } from "@/lib/live";
import type { Mood } from "@/lib/types";

function blockedEntriesFor(
  agentId: string,
  row: LiveAgentView | undefined,
  passed: BlockedEntry[] | undefined,
): BlockedEntry[] {
  if (passed && passed.length > 0) return passed;
  if (row && row.state === "blocked") {
    const built = agentBlockedEntry(
      { id: row.agent_id, name: row.name, slug: row.slug, role: "" },
      row,
      "blocked",
    );
    if (built) return [built];
  }
  return [
    {
      id: `live-${agentId}`,
      agentId,
      agentName: row?.name || "Agent",
      agentRole: "",
      agentSlug: row?.slug ?? "",
      mood: "blocked",
      kicker: "Live status",
      whatBlocked: row?.focus_label || row?.working_on || "Blocked",
      whyBlocked: "",
      unblockNeeded: "",
      waitingOn: "",
      reportedAt: row?.reported_at ?? null,
      sourceUrl: row?.source_url ?? null,
      sourceLabel: null,
      task: null,
    },
  ];
}

export function ClickableMoodPill({
  agentId,
  fallback,
  blockedEntries,
  heading,
}: {
  agentId: string;
  fallback: Mood;
  blockedEntries?: BlockedEntry[];
  heading?: string;
}) {
  const row = useLiveBoard()?.rows.find((item) => item.agent_id === agentId);
  const mood = row ? livePillMood(row.state) : fallback;
  const label = row ? liveStatusLabel(row.state) : statusLabel(fallback);
  if (mood === "blocked") {
    return (
      <BlockedLaunch
        className="pill pill-blocked pill-button"
        entries={blockedEntriesFor(agentId, row, blockedEntries)}
        heading={heading ?? `${row?.name || "Agent"} is blocked`}
      >
        <span className="pill-dot" aria-hidden="true" />
        {label}
      </BlockedLaunch>
    );
  }
  return (
    <span className={`pill pill-${mood}`}>
      <span className="pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ClickableBubbles({
  agentId,
  todo,
  fallback,
  blockedEntries,
  heading,
}: {
  agentId: string;
  todo: number;
  fallback: Bubble[];
  blockedEntries?: BlockedEntry[];
  heading?: string;
}) {
  const row = useLiveBoard()?.rows.find((item) => item.agent_id === agentId);
  const bubbles = row ? bubblesForLive(row, todo) : fallback;
  return (
    <div className="bubbles">
      {bubbles.map((bubble, index) => {
        const tail = index === 0 ? "yes" : "no";
        if (bubble.kind === "stuck") {
          return (
            <BlockedLaunch
              key={`${bubble.kind}-${bubble.label}`}
              className="bubble bubble-stuck"
              dataTail={tail}
              entries={blockedEntriesFor(agentId, row, blockedEntries)}
              heading={heading ?? `${row?.name || "Agent"} is blocked`}
            >
              <span className="bubble-label">{bubble.label}</span>
              {bubble.lines.map((line) => (
                <span key={line} className="bubble-line">
                  {line}
                </span>
              ))}
            </BlockedLaunch>
          );
        }
        return (
          <div key={`${bubble.kind}-${bubble.label}`} className={`bubble bubble-${bubble.kind}`} data-tail={tail}>
            <div className="bubble-label">{bubble.label}</div>
            {bubble.lines.map((line) => (
              <div key={line} className="bubble-line">
                {line}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function ClickableAgentNow({
  agentId,
  blockedEntries,
  heading,
}: {
  agentId: string;
  blockedEntries?: BlockedEntry[];
  heading?: string;
}) {
  const board = useLiveBoard();
  const row = board?.rows.find((item) => item.agent_id === agentId);
  const state = row?.state ?? "idle";
  const clock = board?.now ?? null;
  const age =
    clock === null
      ? null
      : presenceTimeLabel(
          { state, lastActive: row?.updated_at ?? null, reportedAt: row?.reported_at ?? null },
          new Date(clock),
        );
  const timeLabel = age?.label ?? row?.time_label ?? "No activity yet";
  const stale = age ? age.stale : row?.stale !== false;
  const label = liveStatusLabel(state);
  return (
    <div className="live-now">
      <div className="live-now-top">
        <span className="live-kicker">Right now</span>
        {state === "blocked" ? (
          <BlockedLaunch
            className="pill pill-blocked pill-button"
            entries={blockedEntriesFor(agentId, row, blockedEntries)}
            heading={heading ?? `${row?.name || "Agent"} is blocked`}
          >
            <span className="pill-dot" aria-hidden="true" />
            {label}
          </BlockedLaunch>
        ) : (
          <span className={`pill pill-${livePillMood(state)}`}>
            <span className="pill-dot" aria-hidden="true" />
            {label}
          </span>
        )}
      </div>
      <p className="live-focus">{row?.focus_label ?? "No update yet"}</p>
      <p className={stale ? "live-time is-stale" : "live-time"}>{timeLabel}</p>
    </div>
  );
}
