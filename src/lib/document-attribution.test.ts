import { describe, expect, it } from "vitest";
import { presentActivity } from "@/lib/board";
import { documentAgentName } from "@/lib/documents";
import type { Agent } from "@/lib/types";

const chopper: Agent = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "chopper",
  name: "Chopper",
  role: "Herzen Co.",
  sort_order: 2,
  last_active: null,
};

describe("document attribution", () => {
  it("names the agent stored on the event, including one logged with the admin key", () => {
    expect(documentAgentName([chopper], chopper.id)).toBe("Chopper");
    expect(documentAgentName([chopper], "missing")).toBe("Unknown agent");
    expect(documentAgentName([chopper], null)).toBe("Unknown agent");
  });

  it("shows that same agent in the activity feed", () => {
    const [item] = presentActivity(
      [
        {
          id: "event-1",
          actor: chopper.slug,
          verb: "document_edited",
          task_id: null,
          document_id: "doc-1",
          summary: "edited “Coral Gables dental audit”",
          created_at: "2026-10-19T18:00:00.000Z",
        },
      ],
      [chopper],
      new Map([[chopper.id, "active"]]),
    );
    expect(item.actorName).toBe("Chopper");
    expect(item.actor).toBe("chopper");
    expect(item.isTito).toBe(false);
  });
});