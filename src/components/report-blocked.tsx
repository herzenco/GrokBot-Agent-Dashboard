"use client";

import { BlockedLaunch } from "@/components/blocked-detail-modal";
import { reportBlockedEntry, type BlockedAgentRef } from "@/lib/blocked";
import { reportBlockedLabel } from "@/lib/blocked-payload";
import type { Mood, ReportBlockedItem } from "@/lib/types";

export function ReportBlockedColumn({
  items,
  agent,
  mood,
  reportDate,
  postedAt,
}: {
  items: ReportBlockedItem[];
  agent: BlockedAgentRef;
  mood: Mood;
  reportDate: string;
  postedAt?: string | null;
}) {
  return (
    <section className="report-col warn">
      <h3>
        Blocked <span>{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="quiet-line">None</p>
      ) : (
        <ul>
          {items.map((item, index) => {
            const entry = reportBlockedEntry({ agent, mood, reportDate, item, index, postedAt });
            const label = reportBlockedLabel(item);
            return (
              <li key={`${entry.id}-${label}`}>
                <BlockedLaunch className="report-block-btn" entries={[entry]} heading={`${agent.name} is blocked`}>
                  {label}
                </BlockedLaunch>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
