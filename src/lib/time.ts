import { BUSINESS_TZ } from "./workflow";

/** Minutes the zone is ahead of UTC at instant `d` (Riga: +120 winter, +180 summer). */
export function tzOffsetMin(d: Date, tz = BUSINESS_TZ): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Local wall time (day "YYYY-MM-DD" + minutes after midnight) in the business zone → UTC instant. */
export function zonedToUtc(day: string, minutes: number, tz = BUSINESS_TZ): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, minutes);
  const off = tzOffsetMin(new Date(guess), tz);
  let t = guess - off * 60000;
  const off2 = tzOffsetMin(new Date(t), tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}

/** "YYYY-MM-DD" of an instant in the business zone. */
export function localDay(d: Date, tz = BUSINESS_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

/** Minutes since local midnight in the business zone. */
export function localMinutes(d: Date, tz = BUSINESS_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** UTC bounds of a local business day. */
export function dayBounds(day: string) {
  return { from: zonedToUtc(day, 0), to: zonedToUtc(addDays(day, 1), 0) };
}

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
