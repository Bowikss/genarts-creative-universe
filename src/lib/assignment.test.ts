import { describe, it, expect } from "vitest";
import { pickStation, type AStation } from "./assignment";

const svc = "full";
const st = (id: string, number: number, extra: Partial<AStation> = {}): AStation => ({
  id, number, open_time: "08:00", close_time: "20:00", out_of_service: false, serviceIds: [svc], ...extra,
});
// 10:00 Riga time in November = 08:00 UTC
const start = new Date("2026-11-20T08:00:00Z");
const end = new Date("2026-11-20T08:45:00Z");
const base = { serviceId: svc, start, end, appointments: [], unavailability: [] };

describe("pickStation", () => {
  it("skips stations that don't support the service", () => {
    expect(pickStation({ ...base, stations: [st("a", 1, { serviceIds: [] }), st("b", 2)] })?.id).toBe("b");
  });
  it("skips stations closed during the slot", () => {
    expect(pickStation({ ...base, stations: [st("a", 1, { open_time: "11:00" }), st("b", 2)] })?.id).toBe("b");
  });
  it("skips stations with an overlapping appointment", () => {
    const appointments = [{ station_id: "a", starts_at: "2026-11-20T08:30:00Z", ends_at: "2026-11-20T09:00:00Z" }];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1), st("b", 2)] })?.id).toBe("b");
  });
  it("skips stations in maintenance", () => {
    const unavailability = [{ station_id: "a", starts_at: "2026-11-20T07:00:00Z", ends_at: "2026-11-20T12:00:00Z" }];
    expect(pickStation({ ...base, unavailability, stations: [st("a", 1), st("b", 2)] })?.id).toBe("b");
    expect(pickStation({ ...base, stations: [st("a", 1, { out_of_service: true })] })).toBeNull();
  });
  it("prefers the least-loaded station that day", () => {
    const appointments = [{ station_id: "a", starts_at: "2026-11-20T12:00:00Z", ends_at: "2026-11-20T13:00:00Z" }];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1), st("b", 2)] })?.id).toBe("b");
  });
  it("returns null when nothing is free", () => {
    expect(pickStation({ ...base, stations: [] })).toBeNull();
  });
});
