"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CloseIcon } from "@/components/icons";
import { useLiveBoard } from "@/components/live-status";
import { useFeed } from "@/components/shell";
import type { ActivityView } from "@/lib/board";
import { LIVE_POLL_MS, moodForActor, shouldPollNow } from "@/lib/live";

export function ActivityPanel({ items }: { items: ActivityView[] }) {
  const live = useLiveBoard();
  const { close } = useFeed();
  const [rows, setRows] = useState(items);
  const onBoard = live?.polling === true;

  useEffect(() => {
    if (onBoard) return;
    setRows(items);
  }, [items, onBoard]);

  useEffect(() => {
    if (onBoard) return;
    let ignore = false;
    async function load() {
      if (!shouldPollNow(document.visibilityState)) return;
      try {
        const response = await fetch("/api/live/activity", { cache: "no-store" });
        if (!response.ok) return;
        const type = response.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) return;
        const body = (await response.json()) as { items?: unknown };
        if (!ignore && Array.isArray(body.items)) setRows(body.items as ActivityView[]);
      } catch {
        // Keep the last good snapshot when a poll fails.
      }
    }
    const timer = window.setInterval(() => void load(), LIVE_POLL_MS);
    function onVisible() {
      if (shouldPollNow(document.visibilityState)) void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onBoard]);

  const shown = live?.polling ? live.activity : rows;
  const liveRows = live?.rows ?? [];

  return (
    <aside className="activity" aria-label="Activity">
      <div className="activity-head">
        <div className="activity-title">
          <h2>
            Activity <span>today</span>
          </h2>
          <span className="live-mark">Live</span>
        </div>
        <button type="button" className="icon-btn quiet" onClick={close} aria-label="Close activity">
          <CloseIcon />
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="empty">Nothing yet today.</p>
      ) : (
        <ol className="activity-list">
          {shown.map((item) => (
            <li key={item.id} className="activity-item">
              <span className="activity-rail">
                {item.isTito ? (
                  <span className="tito-mark" aria-hidden="true">
                    T
                  </span>
                ) : (
                  <Avatar name={item.actorName} mood={moodForActor(item.actor, item.actorName, liveRows, item.mood)} size={28} />
                )}
                <span className="rail-line" />
              </span>
              <div className="activity-copy">
                <div>
                  <strong>{item.actorName}</strong> {item.summary}
                </div>
                <div className={item.emphasize ? "activity-time time-alert" : "activity-time"}>{item.timeLabel}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
