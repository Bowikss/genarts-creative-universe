import { addDays, localDay, localMinutes, toMin, zonedToUtc } from "./time";

export { localDay, localMinutes } from "./time";

export interface AStation {
  id: string;
  number: number;
  open_time: string;
  close_time: string;
  out_of_service: boolean;
  serviceIds: string[];
}
/** A booking or maintenance window. `busy_until` (early pickup) wins over `ends_at` when present. */
export interface ABusy {
  id?: string;
  station_id: string | null;
  starts_at: string;
  ends_at: string;
  busy_until?: string | null;
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
const busyEnd = (b: ABusy) => new Date(b.busy_until ?? b.ends_at).getTime();
const NEAR_MS = 30 * 60000;

export interface Slot {
  start: Date;
  end: Date;
  ignoreId?: string | undefined;
}

/** Every station that could take this slot: supports the service, open the whole time, no clash. */
export function candidateStations(opts: {
  stations: AStation[];
  serviceId: string;
  start: Date;
  end: Date;
  appointments: ABusy[];
  unavailability: ABusy[];
  ignoreId?: string | undefined;
}): AStation[] {
  const { stations, serviceId, start, end, appointments, unavailability, ignoreId } = opts;
  const s = start.getTime(),
    e = end.getTime();
  if (localDay(start) !== localDay(new Date(e - 1))) return [];
  const sMin = localMinutes(start);
  const eMin = sMin + Math.round((e - s) / 60000);
  return stations.filter((st) => {
    if (st.out_of_service || !st.serviceIds.includes(serviceId)) return false;
    if (sMin < toMin(st.open_time) || eMin > toMin(st.close_time)) return false;
    const busy = [
      ...appointments.filter((a) => !ignoreId || a.id !== ignoreId),
      ...unavailability,
    ].filter((b) => b.station_id === st.id);
    return !busy.some((b) => overlaps(s, e, new Date(b.starts_at).getTime(), busyEnd(b)));
  });
}

/**
 * Picks the most suitable station for a slot. Among stations that can take it:
 * 1. fewest scheduling conflicts — other bookings within 30 min of the slot (keeps buffers, absorbs overruns)
 * 2. balanced workload — fewest booked minutes that day
 * 3. lowest station number
 */
export function pickStation(opts: {
  stations: AStation[];
  serviceId: string;
  start: Date;
  end: Date;
  appointments: ABusy[];
  unavailability: ABusy[];
  ignoreId?: string | undefined;
}): AStation | null {
  const candidates = candidateStations(opts);
  if (!candidates.length) return null;
  const s = opts.start.getTime(),
    e = opts.end.getTime();
  const day = localDay(opts.start);
  const mine = (id: string) =>
    opts.appointments.filter(
      (a) => a.station_id === id && (!opts.ignoreId || a.id !== opts.ignoreId),
    );
  const conflicts = (id: string) =>
    mine(id).filter((a) =>
      overlaps(s - NEAR_MS, e + NEAR_MS, new Date(a.starts_at).getTime(), busyEnd(a)),
    ).length;
  const load = (id: string) =>
    mine(id)
      .filter((a) => localDay(new Date(a.starts_at)) === day)
      .reduce((sum, a) => sum + (busyEnd(a) - new Date(a.starts_at).getTime()), 0);
  return (
    [...candidates].sort(
      (a, b) => conflicts(a.id) - conflicts(b.id) || load(a.id) - load(b.id) || a.number - b.number,
    )[0] ?? null
  );
}

/** Bookable start times on one local day (every `stepMin` minutes), earliest first. */
export function daySlots(opts: {
  stations: AStation[];
  serviceId: string;
  durationMin: number;
  day: string;
  appointments: ABusy[];
  unavailability: ABusy[];
  notBefore?: Date;
  stepMin?: number;
}): { start: Date; end: Date; stationId: string }[] {
  const step = opts.stepMin ?? 15;
  const usable = opts.stations.filter(
    (s) => !s.out_of_service && s.serviceIds.includes(opts.serviceId),
  );
  if (!usable.length) return [];
  const open = Math.min(...usable.map((s) => toMin(s.open_time)));
  const close = Math.max(...usable.map((s) => toMin(s.close_time)));
  const out: { start: Date; end: Date; stationId: string }[] = [];
  for (let m = Math.ceil(open / step) * step; m + opts.durationMin <= close; m += step) {
    const start = zonedToUtc(opts.day, m);
    if (opts.notBefore && start < opts.notBefore) continue;
    const end = new Date(start.getTime() + opts.durationMin * 60000);
    const st = pickStation({ ...opts, start, end });
    if (st) out.push({ start, end, stationId: st.id });
  }
  return out;
}

/** Closest free start times to `wanted`, searching that day and the next `days` days. */
export function alternatives(opts: {
  stations: AStation[];
  serviceId: string;
  durationMin: number;
  wanted: Date;
  appointments: ABusy[];
  unavailability: ABusy[];
  notBefore?: Date;
  days?: number;
  limit?: number;
}): Date[] {
  const first = localDay(opts.wanted);
  const all: Date[] = [];
  for (let i = 0; i <= (opts.days ?? 7); i++) {
    for (const s of daySlots({ ...opts, day: addDays(first, i) })) all.push(s.start);
    if (all.length >= 40) break;
  }
  const w = opts.wanted.getTime();
  return all
    .sort((a, b) => Math.abs(a.getTime() - w) - Math.abs(b.getTime() - w))
    .slice(0, opts.limit ?? 6)
    .sort((a, b) => a.getTime() - b.getTime());
}
