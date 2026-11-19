import { describe, it, expect } from "vitest";
import { alternatives, daySlots, pickStation, type AStation } from "./assignment";
import { dayBounds, zonedToUtc } from "./time";

const svc = "full";
const st = (id: string, number: number, extra: Partial<AStation> = {}): AStation => ({
  id,
  number,
  open_time: "08:00",
  close_time: "20:00",
  out_of_service: false,
  serviceIds: [svc],
  ...extra,
});
// 10:00 Riga time in November = 08:00 UTC
const start = new Date("2026-11-20T08:00:00Z");
const end = new Date("2026-11-20T08:45:00Z");
const base = { serviceId: svc, start, end, appointments: [], unavailability: [] };

describe("pickStation", () => {
  it("skips stations that don't support the service", () => {
    expect(
      pickStation({ ...base, stations: [st("a", 1, { serviceIds: [] }), st("b", 2)] })?.id,
    ).toBe("b");
  });
  it("skips stations closed during the slot", () => {
    expect(
      pickStation({ ...base, stations: [st("a", 1, { open_time: "11:00" }), st("b", 2)] })?.id,
    ).toBe("b");
  });
  it("skips stations with an overlapping appointment", () => {
    const appointments = [
      { station_id: "a", starts_at: "2026-11-20T08:30:00Z", ends_at: "2026-11-20T09:00:00Z" },
    ];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1), st("b", 2)] })?.id).toBe(
      "b",
    );
  });
  it("skips stations in maintenance", () => {
    const unavailability = [
      { station_id: "a", starts_at: "2026-11-20T07:00:00Z", ends_at: "2026-11-20T12:00:00Z" },
    ];
    expect(pickStation({ ...base, unavailability, stations: [st("a", 1), st("b", 2)] })?.id).toBe(
      "b",
    );
    expect(pickStation({ ...base, stations: [st("a", 1, { out_of_service: true })] })).toBeNull();
  });
  it("prefers the least-loaded station that day", () => {
    const appointments = [
      { station_id: "a", starts_at: "2026-11-20T12:00:00Z", ends_at: "2026-11-20T13:00:00Z" },
    ];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1), st("b", 2)] })?.id).toBe(
      "b",
    );
  });
  it("returns null when nothing is free", () => {
    expect(pickStation({ ...base, stations: [] })).toBeNull();
  });
});

describe("scheduling extras", () => {
  it("ignores the appointment being edited (reschedule in place)", () => {
    const appointments = [
      {
        id: "me",
        station_id: "a",
        starts_at: "2026-11-20T08:00:00Z",
        ends_at: "2026-11-20T08:45:00Z",
      },
    ];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1)], ignoreId: "me" })?.id).toBe(
      "a",
    );
    expect(pickStation({ ...base, appointments, stations: [st("a", 1)] })).toBeNull();
  });
  it("early pickup (busy_until) frees the rest of the slot", () => {
    const appointments = [
      {
        station_id: "a",
        starts_at: "2026-11-20T07:30:00Z",
        ends_at: "2026-11-20T08:30:00Z",
        busy_until: "2026-11-20T07:55:00Z",
      },
    ];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1)] })?.id).toBe("a");
  });
  it("prefers the station without a booking right next to the slot", () => {
    const appointments = [
      { station_id: "a", starts_at: "2026-11-20T08:45:00Z", ends_at: "2026-11-20T09:00:00Z" },
      { station_id: "b", starts_at: "2026-11-20T13:00:00Z", ends_at: "2026-11-20T14:00:00Z" },
    ];
    expect(pickStation({ ...base, appointments, stations: [st("a", 1), st("b", 2)] })?.id).toBe(
      "b",
    );
  });
  it("lists free day slots in Riga time and suggests the closest alternatives", () => {
    const stations = [st("a", 1, { open_time: "08:00", close_time: "10:00" })];
    const slots = daySlots({
      stations,
      serviceId: svc,
      durationMin: 45,
      day: "2026-11-20",
      appointments: [],
      unavailability: [],
    });
    expect(slots[0]!.start.toISOString()).toBe("2026-11-20T06:00:00.000Z"); // 08:00 Riga (UTC+2)
    expect(slots.at(-1)!.start.toISOString()).toBe("2026-11-20T07:15:00.000Z"); // 09:15 + 45 = 10:00
    const busy = [
      { station_id: "a", starts_at: "2026-11-20T06:00:00Z", ends_at: "2026-11-20T08:00:00Z" },
    ];
    const alts = alternatives({
      stations,
      serviceId: svc,
      durationMin: 45,
      wanted: new Date("2026-11-20T06:30:00Z"),
      appointments: busy,
      unavailability: [],
      days: 1,
    });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts[0]!.toISOString().startsWith("2026-11-21T06:00")).toBe(true); // next morning
  });
});

describe("time zone", () => {
  it("converts Riga wall time across DST", () => {
    expect(zonedToUtc("2026-07-01", 600).toISOString()).toBe("2026-07-01T07:00:00.000Z"); // summer +3
    expect(zonedToUtc("2026-12-01", 600).toISOString()).toBe("2026-12-01T08:00:00.000Z"); // winter +2
    expect(dayBounds("2026-03-29").to.getTime() - dayBounds("2026-03-29").from.getTime()).toBe(
      23 * 3600000,
    ); // DST day
  });
});
