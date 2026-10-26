import { describe, expect, it } from "vitest";
import { resolveReportDate } from "@/lib/reports-view";

const dates = ["2026-10-23", "2026-10-22", "2026-10-21", "2026-10-20", "2026-10-19"];

describe("resolveReportDate", () => {
  it("opens the latest posted day when today has no reports and no date was requested", () => {
    expect(
      resolveReportDate({ explicit: undefined, today: "2026-10-26", todayCount: 0, dates }),
    ).toEqual({ effectiveDate: "2026-10-23", showingLatest: true });
  });

  it("stays on today once a report has been posted", () => {
    expect(
      resolveReportDate({
        explicit: null,
        today: "2026-10-26",
        todayCount: 2,
        dates: ["2026-10-26", ...dates],
      }),
    ).toEqual({ effectiveDate: "2026-10-26", showingLatest: false });
  });

  it("honors an explicit date, including today when it is still empty", () => {
    expect(
      resolveReportDate({ explicit: "2026-10-22", today: "2026-10-26", todayCount: 0, dates }),
    ).toEqual({ effectiveDate: "2026-10-22", showingLatest: false });
    expect(
      resolveReportDate({ explicit: "2026-10-26", today: "2026-10-26", todayCount: 0, dates }),
    ).toEqual({ effectiveDate: "2026-10-26", showingLatest: false });
  });

  it("treats a bad date param as no date", () => {
    expect(
      resolveReportDate({ explicit: "yesterday", today: "2026-10-26", todayCount: 0, dates }),
    ).toEqual({ effectiveDate: "2026-10-23", showingLatest: true });
  });
});
