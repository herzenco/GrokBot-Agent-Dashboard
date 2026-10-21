import { describe, expect, it } from "vitest";
import { bubblesForLive, buildBoard, presentActivity } from "@/lib/board";
import { effectiveCounts, moodForActor, moodMap, presentLiveStatus } from "@/lib/live";
import type { ActivityRow, Agent, AgentStatusRow, Task } from "@/lib/types";

const now = new Date("2026-10-19T18:00:00.000Z");
const minute = 60 * 1000;

function at(msAgo: number): string {
  return new Date(now.getTime() - msAgo).toISOString();
}

const agents: Agent[] = [
  { id: "chopper", slug: "chopper", name: "Chopper", role: "Herzen Co.", sort_order: 1, last_active: at(2 * minute) },
  { id: "roger", slug: "roger", name: "Roger", role: "Chief of staff", sort_order: 2, last_active: null },
  { id: "ig", slug: "ig-11", name: "IG-11", role: "Security", sort_order: 3, last_active: at(2 * minute) },
];

function status(partial: AgentStatusRow): AgentStatusRow {
  return partial;
}

function task(partial: Partial<Task> & Pick<Task, "id" | "agent_id" | "status">): Task {
  return {
    title: "Ship the memo",
    details: null,
    priority: "normal",
    blocked: false,
    blocked_note: null,
    created_at: at(60 * minute),
    updated_at: at(60 * minute),
    done_at: null,
    ...partial,
  };
}

describe("effective state on every surface", () => {
  it("shows an idle posted agent with last_active 2 minutes ago as working everywhere", () => {
    const postedIdle = at(2 * 60 * minute);
    const activeAt = at(2 * minute);
    const blockedAt = at(90 * minute);
    const live = presentLiveStatus(
      agents,
      [
        status({ agent_id: "chopper", state: "idle", working_on: "", updated_at: postedIdle }),
        status({ agent_id: "ig", state: "blocked", working_on: "Waiting on Matt", updated_at: blockedAt }),
      ],
      now,
      [{ actor: "chopper", summary: "posted today's report", created_at: activeAt }],
    );

    expect(live.find((view) => view.slug === "chopper")).toMatchObject({
      state: "working",
      reported_state: "idle",
      focus_label: "posted today's report",
      time_label: "Active 2 min ago",
    });

    const { cards, stats } = buildBoard(
      agents,
      [task({ id: "todo-1", agent_id: "chopper", status: "todo" })],
      [],
      0,
      1,
      live,
    );
    const chopper = cards.find((card) => card.agent.slug === "chopper");
    const roger = cards.find((card) => card.agent.slug === "roger");
    const ig = cards.find((card) => card.agent.slug === "ig-11");

    expect(chopper?.mood).toBe("active");
    expect(chopper?.bubbles).toEqual([{ kind: "work", label: "Working on", lines: ["posted today's report"] }]);
    expect(chopper?.bubbles.some((bubble) => bubble.label === "Napping")).toBe(false);
    expect(roger?.mood).toBe("idle");
    expect(roger?.bubbles).toEqual([
      { kind: "nap", label: "Napping", lines: ["Nothing in progress. 0 waiting in To do."] },
    ]);
    expect(ig?.mood).toBe("blocked");
    expect(ig?.bubbles[0]?.kind).toBe("stuck");
    expect(ig?.bubbles[0]?.label).toBe("Stuck on Waiting on Matt");

    expect(stats).toMatchObject({ working: 1, stuck: 1, napping: 1, blocked: 0 });
    expect(effectiveCounts(live)).toEqual({ working: 1, stuck: 1, napping: 1 });
    expect(moodMap(live).get("chopper")).toBe("active");
    expect(moodMap(live).get("roger")).toBe("idle");
    expect(moodMap(live).get("ig")).toBe("blocked");

    const feed: ActivityRow[] = [
      {
        id: "act-1",
        actor: "chopper",
        verb: "posted_report",
        task_id: null,
        document_id: null,
        summary: "posted today's report",
        created_at: activeAt,
      },
    ];
    const activity = presentActivity(feed, agents, moodMap(live));
    expect(activity[0]?.mood).toBe("active");
    expect(moodForActor("chopper", "Chopper", live, "idle")).toBe("active");
    expect(moodForActor("roger", "Roger", live, "active")).toBe("idle");
    expect(moodForActor("tito", "Tito", live, "active")).toBe("active");
    expect(bubblesForLive(live.find((view) => view.slug === "chopper"), 1)[0]?.kind).toBe("work");
  });

  it("keeps a quiet agent napping when the only signal is a task in doing", () => {
    const quiet = at(3 * 60 * minute);
    const quietAgents: Agent[] = [{ ...agents[1], last_active: quiet }];
    const live = presentLiveStatus(
      quietAgents,
      [status({ agent_id: "roger", state: "idle", working_on: "", updated_at: quiet })],
      now,
    );
    const { cards, stats } = buildBoard(
      quietAgents,
      [task({ id: "doing-1", agent_id: "roger", status: "doing", title: "Old queue item" })],
      [],
      0,
      1,
      live,
    );
    expect(cards[0]?.doing).toBe(1);
    expect(cards[0]?.mood).toBe("idle");
    expect(cards[0]?.bubbles[0]).toMatchObject({ kind: "nap", label: "Napping" });
    expect(stats).toMatchObject({ working: 0, stuck: 0, napping: 1 });
  });
});
