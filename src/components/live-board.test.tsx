import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveAvatar, LiveBubbles, LiveMoodPill, LiveStatusProvider, LiveSummary } from "@/components/live-status";
import { avatarPalette } from "@/lib/avatar-model";
import { presentLiveStatus } from "@/lib/live";
import type { Agent, AgentStatusRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const now = new Date("2026-10-19T18:00:00.000Z");
const activeAt = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
const postedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

const agents: Agent[] = [
  { id: "chopper", slug: "chopper", name: "Chopper", role: "Herzen Co.", sort_order: 1, last_active: activeAt },
];

const rows: AgentStatusRow[] = [
  { agent_id: "chopper", state: "idle", working_on: "", updated_at: postedAt },
];

describe("live board components", () => {
  it("renders a recently active idle agent as working, not the napping fallback", () => {
    const live = presentLiveStatus(agents, rows, now, [
      { actor: "chopper", summary: "posted today's report", created_at: activeAt },
    ]);
    const html = renderToStaticMarkup(
      <LiveStatusProvider initial={live} initialActivity={[]}>
        <div>
          <LiveSummary />
          <LiveAvatar name="Chopper" agentId="chopper" fallback="idle" size={60} />
          <LiveMoodPill agentId="chopper" fallback="idle" />
          <LiveBubbles
            agentId="chopper"
            todo={1}
            fallback={[{ kind: "nap", label: "Napping", lines: ["Nothing in progress. 1 waiting in To do."] }]}
          />
        </div>
      </LiveStatusProvider>,
    );

    expect(html).toContain("1 agent working");
    expect(html).toContain("Chopper, working");
    expect(html).toContain("pill-active");
    expect(html).toContain("Working");
    expect(html).toContain("bubble-work");
    expect(html).toContain("Working on");
    expect(html).toContain("posted today");
    expect(html).not.toContain("bubble-nap");
    expect(html).not.toContain("Napping");
    expect(html).not.toContain("Chopper, napping");
  });

  it("keeps the Hondo and Frick portraits", () => {
    expect(avatarPalette("Hondo", "active").prop).toBe("patch");
    expect(avatarPalette("Frick", "active").prop).toBe("glass");
    expect(avatarPalette("Hondo", "idle").label).toBe("Hondo, napping");
    expect(avatarPalette("Frick", "active").label).toBe("Frick, working");
  });
});
