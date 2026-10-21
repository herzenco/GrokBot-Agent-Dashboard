"use client";

import { useEffect, useState } from "react";
import {
  OUTREACH_STATUSES,
  outreachChannelLabel,
  outreachStatusLabel,
  type OutreachStatus,
  type OutreachView,
} from "@/lib/outreach";
import { LIVE_POLL_MS, shouldPollNow, updatedAgoLabel } from "@/lib/live";
import { formatEtDateTime } from "@/lib/time";
import { safeHref } from "@/lib/url";

type AgentOption = { id: string; name: string; slug: string };

async function readItems(): Promise<OutreachView[] | null> {
  const response = await fetch("/api/live/outreach", { cache: "no-store" });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  const body = (await response.json()) as { items?: unknown };
  return Array.isArray(body.items) ? (body.items as OutreachView[]) : null;
}

export function OutreachBoard({ initial, agents }: { initial: OutreachView[]; agents: AgentOption[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<OutreachStatus | "all">("all");
  const [agentId, setAgentId] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [polledAt, setPolledAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!shouldPollNow(document.visibilityState)) return;
      const stamp = Date.now();
      try {
        const items = await readItems();
        if (ignore || !items) return;
        setRows(items);
        setPolledAt(stamp);
        setNow(Date.now());
      } catch {
        // Keep the last good snapshot when a poll fails.
      }
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

  const shown = rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (agentId !== "all" && row.agent_id !== agentId) return false;
    return true;
  });

  return (
    <div>
      <div className="outreach-toolbar">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as OutreachStatus | "all")}>
            <option value="all">All</option>
            {OUTREACH_STATUSES.map((value) => (
              <option key={value} value={value}>
                {outreachStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agent
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="all">All</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <p className="outreach-count">
          {shown.length} {shown.length === 1 ? "person" : "people"}
        </p>
        <p className="live-indicator">
          <span className="live-mark">Live</span>
          <span>{updatedAgoLabel(polledAt, now ?? 0)}</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No outreach logged yet.</p>
      ) : shown.length === 0 ? (
        <p className="empty">Nothing matches these filters.</p>
      ) : (
        <div className="outreach-scroll">
          <table className="outreach-table">
            <caption className="sr-only">Outreach</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Title</th>
                <th>Contact</th>
                <th>Channel</th>
                <th>Date</th>
                <th>Status</th>
                <th>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const source = safeHref(row.source_url);
                const linkedin = safeHref(row.linkedin_url);
                const expanded = open[row.id] === true;
                const longMessage = (row.message?.length ?? 0) > 120;
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="outreach-person">{row.person_name}</span>
                      <span className="outreach-agent">{row.agent_name}</span>
                    </td>
                    <td>{row.company ?? "—"}</td>
                    <td>{row.title ?? "—"}</td>
                    <td>
                      <span className="outreach-contact">
                        {row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : null}
                        {linkedin ? (
                          <a href={linkedin} target="_blank" rel="noreferrer">
                            LinkedIn
                          </a>
                        ) : null}
                        {!row.email && !linkedin ? "—" : null}
                      </span>
                    </td>
                    <td>{outreachChannelLabel(row.channel)}</td>
                    <td className="outreach-date">{formatEtDateTime(new Date(row.contacted_at))}</td>
                    <td>
                      <span className={`pill pill-${row.status}`}>
                        <span className="pill-dot" aria-hidden="true" />
                        {outreachStatusLabel(row.status)}
                      </span>
                    </td>
                    <td>
                      {source ? (
                        <a href={source} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      ) : (
                        <span className="quiet-line">No source</span>
                      )}
                    </td>
                    <td>
                      {row.message ? (
                        <>
                          <p className={expanded || !longMessage ? "outreach-message" : "outreach-message is-clamped"}>
                            {row.message}
                          </p>
                          {longMessage ? (
                            <button
                              type="button"
                              className="outreach-message-btn"
                              aria-expanded={expanded}
                              onClick={() => setOpen((current) => ({ ...current, [row.id]: !expanded }))}
                            >
                              {expanded ? "Hide message" : "Show message"}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="quiet-line">No message</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
