const ZONE = "America/New_York";

type Parts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
  monthShort: string;
  dayPart: string;
};

function readParts(date: Date): Parts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const monthShort = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    month: "short",
  }).format(date);
  let hour = map.hour ?? "00";
  if (hour === "24") hour = "00";
  return {
    year: map.year ?? "1970",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour,
    minute: map.minute ?? "00",
    second: map.second ?? "00",
    weekday: map.weekday ?? "",
    monthShort,
    dayPart: String(Number(map.day ?? "1")),
  };
}

function offsetMs(utcDate: Date): number {
  const parts = readParts(utcDate);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcDate.getTime();
}

/** Interpret a calendar date and time as America/New_York. */
export function etLocalToUtc(dateISO: string, time = "00:00:00"): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0));
  return new Date(guess.getTime() - offsetMs(guess));
}

export function etDayRange(dateISO: string): { start: Date; end: Date } {
  const start = etLocalToUtc(dateISO, "00:00:00");
  const [year, month, day] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  const nextISO = next.toISOString().slice(0, 10);
  return { start, end: etLocalToUtc(nextISO, "00:00:00") };
}

export function etTodayISO(now = new Date()): string {
  const parts = readParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function etHour(now = new Date()): number {
  return Number(readParts(now).hour);
}

export function greetingForHour(hour: number): "Morning" | "Afternoon" | "Evening" {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function cleanMeridiem(value: string): string {
  return value.replace(/\u202f/g, " ").replace(/\u00a0/g, " ");
}

export function formatEtTime(date: Date): string {
  return cleanMeridiem(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date),
  );
}

/** Monday, Oct 19 · 8:05 AM ET. The stylesheet uppercases it. */
export function formatEtDateline(date: Date): string {
  const parts = readParts(date);
  return `${parts.weekday}, ${parts.monthShort} ${parts.dayPart} · ${formatEtTime(date)} ET`;
}

export function formatEtDateTime(date: Date): string {
  const parts = readParts(date);
  return `${parts.monthShort} ${parts.dayPart}, ${formatEtTime(date)} ET`;
}

export function ageLabel(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(etLocalToUtc(value).getTime());
}

/** Oct 23, from a YYYY-MM-DD calendar date in America/New_York. */
export function formatIsoMonthDay(dateISO: string): string {
  if (!isIsoDate(dateISO)) return dateISO;
  const parts = readParts(etLocalToUtc(dateISO, "12:00:00"));
  return `${parts.monthShort} ${parts.dayPart}`;
}

/** Fri, Oct 23 */
export function formatIsoWeekday(dateISO: string): string {
  if (!isIsoDate(dateISO)) return dateISO;
  const parts = readParts(etLocalToUtc(dateISO, "12:00:00"));
  return `${parts.weekday.slice(0, 3)}, ${parts.monthShort} ${parts.dayPart}`;
}
