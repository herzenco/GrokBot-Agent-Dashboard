import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResolutionBox } from "@/components/resolution-box";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/app/work-actions", () => ({
  listTaskResolutionsAction: vi.fn(),
  postResolutionAction: vi.fn(),
}));

describe("resolution box", () => {
  it("shows prior resolutions in Eastern Time and a submit field", () => {
    const html = renderToStaticMarkup(
      <ResolutionBox
        taskId="33333333-3333-4333-8333-333333333333"
        state="awaiting_agent"
        canPost
        resolutions={[
          {
            id: "older",
            author: "herzen",
            body: "Check the registrar first.",
            created_at: "2026-11-13T15:00:00.000Z",
          },
          {
            id: "newer",
            author: "herzen",
            body: "Use the sandbox key and retry.",
            created_at: "2026-11-13T19:05:00.000Z",
          },
        ]}
      />,
    );
    expect(html).toContain("Awaiting agent");
    expect(html).toContain("Resolution history");
    expect(html).toContain("Check the registrar first.");
    expect(html).toContain("Use the sandbox key and retry.");
    expect(html).toContain("Nov 13, 10:00 AM ET");
    expect(html).toContain("Nov 13, 2:05 PM ET");
    expect(html).toContain("Resolution");
    expect(html).toContain("Submit");
    expect(html.indexOf("Check the registrar first.")).toBeLessThan(html.indexOf("Use the sandbox key and retry."));
  });
});
