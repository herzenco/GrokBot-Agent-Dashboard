import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BlockedDetailModal } from "@/components/blocked-detail-modal";
import { reportBlockedEntry } from "@/lib/blocked";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

describe("blocked detail modal", () => {
  it("shows every field, with Not provided where a value is missing, and a source link", () => {
    const entry = reportBlockedEntry({
      agent: { id: "chopper", name: "Chopper", slug: "chopper", role: "Herzen Co." },
      mood: "blocked",
      reportDate: "2026-11-12",
      postedAt: "2026-11-12T14:00:00.000Z",
      index: 0,
      item: {
        title: "Audit PR",
        reason: null,
        waiting_on: "Herzen",
        source_url: "https://github.com/herzen-co/audits/pull/10",
        source_label: null,
      },
    });
    const html = renderToStaticMarkup(
      <BlockedDetailModal entries={[entry]} heading="Chopper is blocked" onClose={() => undefined} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Chopper");
    expect(html).toContain("What is blocked");
    expect(html).toContain("Audit PR");
    expect(html).toContain("Why it is blocked");
    expect(html).toContain("Waiting on");
    expect(html).toContain("Herzen");
    expect(html).toContain("Reported");
    expect(html).toContain("Nov 12, 2026, 9:00 AM (America/Cancun)");
    expect(html).toContain("Source");
    expect(html).toContain('href="https://github.com/herzen-co/audits/pull/10"');
    expect(html).toContain("GitHub PR");
    expect(html).toContain("Not provided");
  });
});
