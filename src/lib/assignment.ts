import { BUSINESS_TZ } from "./workflow";

export interface AStation { id: string; number: number; open_time: string; close_time: string; out_of_service: boolean; serviceIds: string[] }
export interface ABusy { station_id: string | null; starts_at: string; ends_at: string }

/** Minutes since local midnight in the business time zone. */
export function localMinutes(d: Date, tz = BUSINESS_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function localDay(d: Date, tz = BUSINESS_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Picks the most suitable station: supports the service, open for the whole slot,
 * not out of service, no overlapping appointment or maintenance window.
 * Among candidates, the one with the fewest booked minutes that day wins; ties go to the lowest number.
 */
export function pickStation(opts: {
  stations: AStation[]; serviceId: string; start: Date; end: Date;
  appointments: ABusy[]; unavailability: ABusy[];
}): AStation | null {
  const { stations, serviceId, start, end, appointments, unavailability } = opts;
  const s = start.getTime(), e = end.getTime();
  const sMin = localMinutes(start);
  const eMin = sMin + Math.round((e - s) / 60000);
  const day = localDay(start);
  const candidates = stations.filter((st) => {
    if (st.out_of_service || !st.serviceIds.includes(serviceId)) return false;
    if (sMin < toMin(st.open_time) || eMin > toMin(st.close_time)) return false;
    const busy = [...appointments, ...unavailability].filter((b) => b.station_id === st.id);
    return !busy.some((b) => overlaps(s, e, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()));
  });
  if (!candidates.length) return null;
  const load = (id: string) => appointments
    .filter((a) => a.station_id === id && localDay(new Date(a.starts_at)) === day)
    .reduce((sum, a) => sum + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()), 0);
  return candidates.sort((a, b) => load(a.id) - load(b.id) || a.number - b.number)[0] ?? null;
}
