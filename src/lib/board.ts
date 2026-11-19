import {
  IN_WORK,
  isDelayed,
  stationStateFor,
  type ApptStatus,
  type StationState,
} from "./workflow";

/** Minimal shapes so the same board logic runs in the browser (RLS data) and on the server (public TV). */
export interface BStation {
  id: string;
  number: number;
  name: string;
  out_of_service: boolean;
  open_time: string;
  close_time: string;
}
export interface BService {
  id: string;
  name: string;
  duration_min: number;
  price: number;
}
export interface BAppt {
  id: string;
  station_id: string | null;
  service_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  started_at: string | null;
  estimated_end: string | null;
  delay_minutes: number;
  reg_number: string;
  make: string;
  model: string;
  customer_name: string;
  assigned_employee: string | null;
}
export interface BUnav {
  id: string;
  station_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}

export interface StationCard<A extends BAppt = BAppt> {
  station: BStation;
  state: StationState;
  current: A | null;
  next: A | null;
  maintenance: BUnav | null;
  delayed: boolean;
  /** The car on the bay is expected to finish after the next booking starts. */
  nextAtRisk: boolean;
  /** Finished cars waiting for pickup that are not the current car. */
  waiting: A[];
}

export function buildBoard<A extends BAppt>(
  d: { stations: BStation[]; appointments: A[]; unavailability: BUnav[] },
  now = new Date(),
): StationCard<A>[] {
  const t = now.getTime();
  return [...d.stations]
    .sort((a, b) => a.number - b.number)
    .map((s) => {
      const appts = d.appointments
        .filter((a) => a.station_id === s.id && a.status !== "cancelled")
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      // The car being worked on wins; a finished car waiting for pickup is shown only if the bay is otherwise idle.
      const working = appts.find((a) => IN_WORK.includes(a.status as ApptStatus)) ?? null;
      const ready = appts.filter((a) => a.status === "ready");
      const current = working ?? ready[0] ?? null;
      const waiting = ready.filter((a) => a !== current);
      const next =
        appts.find(
          (a) => a.status === "confirmed" && a !== current && new Date(a.ends_at).getTime() > t,
        ) ?? null;
      const maintenance =
        d.unavailability.find(
          (u) =>
            u.station_id === s.id &&
            new Date(u.starts_at).getTime() <= t &&
            new Date(u.ends_at).getTime() > t,
        ) ?? null;
      const state = stationStateFor(
        (current?.status as ApptStatus) ?? null,
        !current && (s.out_of_service || !!maintenance),
      );
      const nextAtRisk = !!(
        current &&
        next &&
        current.estimated_end &&
        new Date(current.estimated_end) > new Date(next.starts_at)
      );
      return {
        waiting,
        station: s,
        state,
        current,
        next,
        maintenance,
        delayed: !!current && isDelayed(current, now),
        nextAtRisk,
      };
    });
}

/** Upcoming bookings (not yet arrived), soonest first. */
export function upcoming<A extends BAppt>(appointments: A[], now = new Date(), limit = 12): A[] {
  const t = now.getTime() - 120 * 60000; // keep late arrivals visible for 2 h
  return appointments
    .filter((a) => a.status === "confirmed" && new Date(a.starts_at).getTime() >= t)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}
