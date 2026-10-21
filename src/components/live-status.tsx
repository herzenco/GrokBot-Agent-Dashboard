"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { bubblesForLive, statusLabel, type ActivityView, type Bubble } from "@/lib/board";
import {
  LIVE_POLL_MS,
  effectiveCounts,
  latestIso,
  livePillMood,
  liveStatusLabel,
  presenceTimeLabel,
  shouldPollNow,
  updatedAgoLabel,
  type LiveAgentView,
} from "@/lib/live";
import { formatEtTime } from "@/lib/time";
import type { Mood } from "@/lib/types";

type LiveBoard = {
  rows: LiveAgentView[];
  activity: ActivityView[];
  polledAt: number | null;
  now: number | null;
  polling: true;
};

const LiveContext = createContext<LiveBoard | null>(null);

export function useLiveBoard(): LiveBoard | null {
  return useContext(LiveContext);
}

async function readJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

function asAgents(body: unknown): LiveAgentView[] | null {
  if (!body || typeof body !== "object" || !("agents" in body)) return null;
  const agents = (body as { agents: unknown }).agents;
  return Array.isArray(agents) ? (agents as LiveAgentView[]) : null;
}

function asActivity(body: unknown): ActivityView[] | null {
  if (!body || typeof body !== "object" || !("items" in body)) return null;
  const items = (body as { items: unknown }).items;
  return Array.isArray(items) ? (items as ActivityView[]) : null;
}

export function LiveStatusProvider({
  initial,
  initialActivity,
  children,
}: {
  initial: LiveAgentView[];
  initialActivity: ActivityView[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refreshRef = useRef(router.refresh);
  refreshRef.current = router.refresh;
  const [rows, setRows] = useState(initial);
  const [activity, setActivity] = useState<ActivityView[] | null>(null);
  const [polledAt, setPolledAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!shouldPollNow(document.visibilityState)) return;
      const stamp = Date.now();
      try {
        const [statusBody, activityBody] = await Promise.all([
          readJson("/api/live/status"),
          readJson("/api/live/activity"),
        ]);
        if (ignore) return;
        const nextRows = asAgents(statusBody);
        const nextActivity = asActivity(activityBody);
        if (nextRows) setRows(nextRows);
        if (nextActivity) setActivity(nextActivity);
        if (nextRows || nextActivity) {
          setPolledAt(stamp);
          setNow(Date.now());
        }
      } catch {
        // Keep the last good snapshot when a poll fails.
      }
      if (!ignore) refreshRef.current();
    }

    void load();
    const timer = window.setInterval(() => void load(), LIVE_POLL_MS);
    const tick = window.setInterval(() => {
      if (shouldPollNow(document.visibilityState)) setNow(Date.now());
    }, 1000);

    function onVisible() {
      if (!shouldPollNow(document.visibilityState)) return;
      setNow(Date.now());
      void load();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      window.clearInterval(timer);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <LiveContext.Provider
      value={{ rows, activity: activity ?? initialActivity, polledAt, now, polling: true }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function LiveSummary() {
  const rows = useContext(LiveContext)?.rows ?? [];
  const counts = effectiveCounts(rows);
  const workingWord = counts.working === 1 ? "agent" : "agents";
  return (
    <p className="subhead board-subhead">
      {counts.working} {workingWord} working, <span className="stuck-word">{counts.stuck} stuck</span>, {counts.napping} napping.
    </p>
  );
}

function useLiveAgent(agentId: string): LiveAgentView | undefined {
  return useContext(LiveContext)?.rows.find((item) => item.agent_id === agentId);
}

export function LiveAvatar({
  name,
  agentId,
  fallback,
  size = 60,
}: {
  name: string;
  agentId: string;
  fallback: Mood;
  size?: number;
}) {
  const row = useLiveAgent(agentId);
  const mood = row ? livePillMood(row.state) : fallback;
  return <Avatar name={name} mood={mood} size={size} />;
}

export function LiveMoodPill({ agentId, fallback }: { agentId: string; fallback: Mood }) {
  const row = useLiveAgent(agentId);
  const mood = row ? livePillMood(row.state) : fallback;
  const label = row ? liveStatusLabel(row.state) : statusLabel(fallback);
  return (
    <span className={`pill pill-${mood}`}>
      <span className="pill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function LiveIndicator() {
  const board = useContext(LiveContext);
  const rows = board?.rows ?? [];
  const activity = board?.activity ?? [];
  const latest = latestIso([...rows.map((row) => row.updated_at), ...activity.map((item) => item.createdAt)]);
  const latestLabel = latest ? `${formatEtTime(new Date(latest))} ET` : "No activity yet";
  return (
    <p className="live-indicator">
      <span className="live-mark">Live</span>
      <span>{updatedAgoLabel(board?.polledAt ?? null, board?.now ?? 0)}</span>
      <span className="live-latest">Latest activity {latestLabel}</span>
    </p>
  );
}

export function LiveBubbles({
  agentId,
  todo,
  fallback,
}: {
  agentId: string;
  todo: number;
  fallback: Bubble[];
}) {
  const row = useLiveAgent(agentId);
  const bubbles = row ? bubblesForLive(row, todo) : fallback;
  return (
    <div className="bubbles">
      {bubbles.map((bubble, index) => (
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
  );
}

export function LiveAgentNow({ agentId }: { agentId: string }) {
  const board = useContext(LiveContext);
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
  return (
    <div className="live-now">
      <div className="live-now-top">
        <span className="live-kicker">Right now</span>
        <span className={`pill pill-${livePillMood(state)}`}>
          <span className="pill-dot" aria-hidden="true" />
          {liveStatusLabel(state)}
        </span>
      </div>
      <p className="live-focus">{row?.focus_label ?? "No update yet"}</p>
      <p className={stale ? "live-time is-stale" : "live-time"}>{timeLabel}</p>
    </div>
  );
}
