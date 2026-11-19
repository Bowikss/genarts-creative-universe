export type ApptStatus =
  | "confirmed"
  | "arrived"
  | "checked_in"
  | "washing"
  | "exterior_done"
  | "interior_done"
  | "quality_check"
  | "ready"
  | "picked_up"
  | "cancelled";

export const BUSINESS_TZ = "Europe/Riga";

/** Employee tablet workflow, in order. */
export const EMPLOYEE_STEPS: { status: ApptStatus; label: string }[] = [
  { status: "arrived", label: "Vehicle Arrived" },
  { status: "checked_in", label: "Vehicle Checked In" },
  { status: "washing", label: "Start Washing" },
  { status: "exterior_done", label: "Exterior Cleaning Completed" },
  { status: "interior_done", label: "Interior Cleaning Completed" },
  { status: "quality_check", label: "Quality Check" },
  { status: "ready", label: "Ready for Pickup" },
  { status: "picked_up", label: "Vehicle Picked Up" },
];

/** Customer-facing progress. */
export const CUSTOMER_STEPS: { status: ApptStatus; label: string }[] = [
  { status: "confirmed", label: "Appointment Confirmed" },
  { status: "arrived", label: "Vehicle Arrived" },
  { status: "washing", label: "Washing Started" },
  { status: "exterior_done", label: "Exterior Completed" },
  { status: "interior_done", label: "Interior Completed" },
  { status: "quality_check", label: "Quality Check" },
  { status: "ready", label: "Ready for Pickup" },
];

export const ORDER: ApptStatus[] = [
  "confirmed",
  "arrived",
  "checked_in",
  "washing",
  "exterior_done",
  "interior_done",
  "quality_check",
  "ready",
  "picked_up",
];

export const STATUS_LABEL: Record<ApptStatus, string> = {
  confirmed: "Confirmed",
  arrived: "Arrived",
  checked_in: "Checked in",
  washing: "Washing",
  exterior_done: "Exterior done",
  interior_done: "Interior done",
  quality_check: "Quality check",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export type StationState =
  "available" | "arrived" | "washing" | "quality" | "ready" | "maintenance";

export const STATION_STATE_LABEL: Record<StationState, string> = {
  available: "Available",
  arrived: "Vehicle arrived",
  washing: "Washing in progress",
  quality: "Quality check",
  ready: "Ready for pickup",
  maintenance: "Unavailable",
};

/** Active = vehicle physically at the station. */
export const ACTIVE: ApptStatus[] = [
  "arrived",
  "checked_in",
  "washing",
  "exterior_done",
  "interior_done",
  "quality_check",
  "ready",
];

export function stationStateFor(status: ApptStatus | null, unavailable: boolean): StationState {
  if (unavailable) return "maintenance";
  switch (status) {
    case "arrived":
    case "checked_in":
      return "arrived";
    case "washing":
    case "exterior_done":
    case "interior_done":
      return "washing";
    case "quality_check":
      return "quality";
    case "ready":
      return "ready";
    default:
      return "available";
  }
}

export function stepIndex(s: ApptStatus) {
  return ORDER.indexOf(s);
}

/** Index into CUSTOMER_STEPS reached for a status. */
export function customerProgress(s: ApptStatus): number {
  const idx = stepIndex(s);
  let reached = 0;
  CUSTOMER_STEPS.forEach((step, i) => {
    if (stepIndex(step.status) <= idx) reached = i;
  });
  return reached;
}

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}
export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TZ,
  }).format(new Date(iso));
}
export function fmtLongDate(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TZ,
  }).format(new Date(d));
}
export const euro = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("lv-LV", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));

/** Hides most of a plate for public screens: "AB1234" → "AB••34". */
export function maskPlate(reg: string) {
  const r = reg.replace(/\s+/g, "");
  if (r.length <= 4) return r.slice(0, 1) + "•".repeat(Math.max(0, r.length - 1));
  return r.slice(0, 2) + "•".repeat(r.length - 4) + r.slice(-2);
}

/** Car is still being worked on (not yet ready). */
export const IN_WORK: ApptStatus[] = [
  "arrived",
  "checked_in",
  "washing",
  "exterior_done",
  "interior_done",
  "quality_check",
];
export const LATE_ARRIVAL_MIN = 15;

/** Past its estimated completion and not ready yet, or a delay was reported. */
export function isDelayed(
  a: { status: string; estimated_end: string | null; delay_minutes?: number },
  now = new Date(),
) {
  if (!IN_WORK.includes(a.status as ApptStatus)) return false;
  return (
    (a.delay_minutes ?? 0) > 0 ||
    (!!a.estimated_end && now.getTime() > new Date(a.estimated_end).getTime())
  );
}
/** Booked, start time passed by more than LATE_ARRIVAL_MIN and the car isn't here. */
export function isLateArrival(a: { status: string; starts_at: string }, now = new Date()) {
  return (
    a.status === "confirmed" &&
    now.getTime() > new Date(a.starts_at).getTime() + LATE_ARRIVAL_MIN * 60000
  );
}

export function nextStep(s: ApptStatus): ApptStatus | null {
  const i = EMPLOYEE_STEPS.findIndex((x) => x.status === s);
  if (s === "confirmed") return "arrived";
  return EMPLOYEE_STEPS[i + 1]?.status ?? null;
}
export function prevStep(s: ApptStatus): ApptStatus | null {
  const i = ORDER.indexOf(s);
  return i > 0 ? ORDER[i - 1]! : null;
}

export type Role = "admin" | "manager" | "employee";
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

export const STATE_BG: Record<StationState, string> = {
  available: "bg-st-available",
  arrived: "bg-st-arrived",
  washing: "bg-st-washing",
  quality: "bg-st-quality",
  ready: "bg-st-ready",
  maintenance: "bg-st-maintenance",
};
export const STATE_BORDER: Record<StationState, string> = {
  available: "border-st-available",
  arrived: "border-st-arrived",
  washing: "border-st-washing",
  quality: "border-st-quality",
  ready: "border-st-ready",
  maintenance: "border-st-maintenance",
};
export const STATE_TEXT: Record<StationState, string> = {
  available: "text-st-available",
  arrived: "text-st-arrived",
  washing: "text-st-washing",
  quality: "text-st-quality",
  ready: "text-st-ready",
  maintenance: "text-st-maintenance",
};
