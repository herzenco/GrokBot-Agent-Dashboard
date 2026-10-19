"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { CloseIcon } from "@/components/icons";
import { useFeed } from "@/components/shell";
import type { ActivityView } from "@/lib/board";
import { LIVE_POLL_MS } from "@/lib/live";

export function ActivityPanel({ items }: { items: ActivityView[] }) {
  const { close } = useFeed();
  const [rows, setRows] = useState(items);

  useEffect(() => {
    setRows(items);
  }, [items]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (document.visibilityState === "hidden") return;
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
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ignore = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
      {rows.length === 0 ? (
        <p className="empty">Nothing yet today.</p>
      ) : (
        <ol className="activity-list">
          {rows.map((item) => (
            <li key={item.id} className="activity-item">
              <span className="activity-rail">
                {item.isTito ? (
                  <span className="tito-mark" aria-hidden="true">
                    T
                  </span>
                ) : (
                  <Avatar name={item.actorName} mood={item.mood} size={28} />
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
