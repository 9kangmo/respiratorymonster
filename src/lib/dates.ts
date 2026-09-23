const pad = (n: number) => String(n).padStart(2, "0");

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** Wall-clock date and time of an instant in the given zone. */
export function zonedParts(instant: Date | string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(typeof instant === "string" ? new Date(instant) : instant)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function todayIn(timeZone: string): string {
  return zonedParts(new Date(), timeZone).date;
}

/** Converts a wall-clock time in `timeZone` to a UTC ISO string. */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [h, mi] = time.split(":").map(Number);
  const guess = parseDate(date).getTime() + (h * 60 + mi) * 60_000;
  const seen = zonedParts(new Date(guess), timeZone);
  const seenMs = parseDate(seen.date).getTime() + timeToMinutes(seen.time) * 60_000;
  return new Date(guess - (seenMs - guess)).toISOString();
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Adds minutes to a local wall-clock date+time, returning the new wall-clock values. */
export function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const total = timeToMinutes(time) + minutes;
  const dayShift = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, dayShift), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

/** Weeks (Sunday first) covering the given month; month is 1-12. */
export function monthMatrix(year: number, month: number): string[][] {
  const first = `${year}-${pad(month)}-01`;
  const start = addDays(first, -parseDate(first).getUTCDay());
  const weeks: string[][] = [];
  let cursor = start;
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (cursor.slice(0, 7) === first.slice(0, 7));
  return weeks;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayOf(date: string): number {
  return parseDate(date).getUTCDay();
}

export function formatDate(date: string, withWeekday = true): string {
  const d = parseDate(date);
  const base = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return withWeekday ? `${base} (${WEEKDAYS[d.getUTCDay()]})` : base;
}

export function relativeLabel(date: string, today: string): string {
  const n = diffDays(today, date);
  if (n === 0) return "오늘";
  if (n === 1) return "내일";
  if (n === -1) return "어제";
  return n > 0 ? `D-${n}` : `${-n}일 지남`;
}

export { WEEKDAYS };
