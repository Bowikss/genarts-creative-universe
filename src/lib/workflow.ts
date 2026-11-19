export type ApptStatus =
  | "confirmed" | "arrived" | "checked_in" | "washing" | "exterior_done"
  | "interior_done" | "quality_check" | "ready" | "picked_up" | "cancelled";

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
  "confirmed", "arrived", "checked_in", "washing", "exterior_done",
  "interior_done", "quality_check", "ready", "picked_up",
];

export const STATUS_LABEL: Record<ApptStatus, string> = {
  confirmed: "Confirmed", arrived: "Arrived", checked_in: "Checked in", washing: "Washing",
  exterior_done: "Exterior done", interior_done: "Interior done", quality_check: "Quality check",
  ready: "Ready for pickup", picked_up: "Picked up", cancelled: "Cancelled",
};

export type StationState = "available" | "arrived" | "washing" | "quality" | "ready" | "maintenance";

export const STATION_STATE_LABEL: Record<StationState, string> = {
  available: "Available", arrived: "Vehicle arrived", washing: "Washing in progress",
  quality: "Quality check", ready: "Ready for pickup", maintenance: "Unavailable",
};

/** Active = vehicle physically at the station. */
export const ACTIVE: ApptStatus[] = ["arrived", "checked_in", "washing", "exterior_done", "interior_done", "quality_check", "ready"];

export function stationStateFor(status: ApptStatus | null, unavailable: boolean): StationState {
  if (unavailable) return "maintenance";
  switch (status) {
    case "arrived": case "checked_in": return "arrived";
    case "washing": case "exterior_done": case "interior_done": return "washing";
    case "quality_check": return "quality";
    case "ready": return "ready";
    default: return "available";
  }
}

export function stepIndex(s: ApptStatus) { return ORDER.indexOf(s); }

/** Index into CUSTOMER_STEPS reached for a status. */
export function customerProgress(s: ApptStatus): number {
  const idx = stepIndex(s);
  let reached = 0;
  CUSTOMER_STEPS.forEach((step, i) => { if (stepIndex(step.status) <= idx) reached = i; });
  return reached;
}

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ }).format(new Date(iso));
}
export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BUSINESS_TZ }).format(new Date(iso));
}
