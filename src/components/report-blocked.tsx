"use client";

import { BlockedLaunch } from "@/components/blocked-detail-modal";
import { reportBlockedEntry, type BlockedAgentRef } from "@/lib/blocked";
import type { Mood } from "@/lib/types";

export function ReportBlockedColumn({
  items,
  agent,
  mood,
  reportDate,
}: {
  items: string[];
  agent: BlockedAgentRef;
  mood: Mood;
  reportDate: string;
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
            const entry = reportBlockedEntry({ agent, mood, reportDate, text: item, index });
            return (
              <li key={`${item}-${index}`}>
                <BlockedLaunch className="report-block-btn" entries={[entry]} heading={`${agent.name} is blocked`}>
                  {item}
                </BlockedLaunch>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
