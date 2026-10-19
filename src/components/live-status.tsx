"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { LIVE_POLL_MS, livePillMood, liveStatusLabel, type LiveAgentView } from "@/lib/live";

const LiveContext = createContext<LiveAgentView[]>([]);

async function readJson(url: string): Promise<unknown | null> {
  if (document.visibilityState === "hidden") return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

export function LiveStatusProvider({
  initial,
  children,
}: {
  initial: LiveAgentView[];
  children: React.ReactNode;
}) {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const body = await readJson("/api/live/status");
        if (!body || typeof body !== "object" || !("agents" in body)) return;
        const agents = (body as { agents: unknown }).agents;
        if (!ignore && Array.isArray(agents)) setRows(agents as LiveAgentView[]);
      } catch {
        // Keep the last good snapshot when a poll fails.
      }
    }
    const timer = window.setInterval(() => void load(), LIVE_POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <LiveContext.Provider value={rows}>{children}</LiveContext.Provider>;
}

export function LiveSummary() {
  const rows = useContext(LiveContext);
  const working = rows.filter((row) => row.state === "working").length;
  const blocked = rows.filter((row) => row.state === "blocked").length;
  const idle = rows.filter((row) => row.state === "idle").length;
  return (
    <p className="live-summary">
      Right now, {working} working, <span className="stuck-word">{blocked} blocked</span>, {idle} idle.
    </p>
  );
}

export function LiveAgentNow({ agentId }: { agentId: string }) {
  const rows = useContext(LiveContext);
  const row = rows.find((item) => item.agent_id === agentId);
  const state = row?.state ?? "idle";
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
      <p className={row?.stale !== false ? "live-time is-stale" : "live-time"}>
        {row?.time_label ?? "No heartbeat yet"}
      </p>
    </div>
  );
}
