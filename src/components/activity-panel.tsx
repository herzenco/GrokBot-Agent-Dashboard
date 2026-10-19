"use client";

import { Avatar } from "@/components/avatar";
import { CloseIcon } from "@/components/icons";
import { useFeed } from "@/components/shell";
import type { ActivityView } from "@/lib/board";

export function ActivityPanel({ items }: { items: ActivityView[] }) {
  const { close } = useFeed();
  return (
    <aside className="activity" aria-label="Activity">
      <div className="activity-head">
        <h2>
          Activity <span>today</span>
        </h2>
        <button type="button" className="icon-btn quiet" onClick={close} aria-label="Close activity">
          <CloseIcon />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="empty">Nothing yet today.</p>
      ) : (
        <ol className="activity-list">
          {items.map((item) => (
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
