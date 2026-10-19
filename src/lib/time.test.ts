import { describe, expect, it } from "vitest";
import { etDayRange, etLocalToUtc, etTodayISO, formatEtTime } from "@/lib/time";

describe("America/New_York clock", () => {
  it("converts 19 Oct 2026 8:05 AM ET to UTC", () => {
    expect(etLocalToUtc("2026-10-19", "08:05:00").toISOString()).toBe("2026-10-19T12:05:00.000Z");
  });

  it("bounds that calendar day and formats the time", () => {
    const range = etDayRange("2026-10-19");
    expect(range.start.toISOString()).toBe("2026-10-19T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-20T04:00:00.000Z");
    expect(formatEtTime(etLocalToUtc("2026-10-19", "08:05:00"))).toBe("8:05 AM");
    expect(etTodayISO(etLocalToUtc("2026-10-19", "08:05:00"))).toBe("2026-10-19");
  });
});
