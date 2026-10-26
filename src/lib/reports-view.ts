import { isIsoDate } from "@/lib/time";

/** Which report day the page should open on. */
export function resolveReportDate(input: {
  explicit?: string | null;
  today: string;
  todayCount: number;
  dates: string[];
}): { effectiveDate: string; showingLatest: boolean } {
  if (input.explicit && isIsoDate(input.explicit)) {
    return { effectiveDate: input.explicit, showingLatest: false };
  }
  if (input.todayCount > 0) return { effectiveDate: input.today, showingLatest: false };
  const latest = input.dates.find((date) => date < input.today);
  if (latest) return { effectiveDate: latest, showingLatest: true };
  return { effectiveDate: input.today, showingLatest: false };
}
