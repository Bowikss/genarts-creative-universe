import { describe, expect, it } from "vitest";
import { buildBoard } from "./board";
import { maskPlate, isDelayed, nextStep, prevStep } from "./workflow";

const station = (id: string, n: number, extra = {}) => ({
  id,
  number: n,
  name: `Bay ${n}`,
  out_of_service: false,
  open_time: "08:00",
  close_time: "20:00",
  ...extra,
});
const appt = (o: Record<string, unknown>) => ({
  id: "x",
  station_id: "a",
  service_id: "s",
  status: "confirmed",
  starts_at: "2026-11-20T08:00:00Z",
  ends_at: "2026-11-20T08:45:00Z",
  started_at: null,
  estimated_end: "2026-11-20T08:45:00Z",
  delay_minutes: 0,
  reg_number: "AB1234",
  make: "",
  model: "",
  customer_name: "",
  assigned_employee: null,
  ...o,
});
const now = new Date("2026-11-20T08:20:00Z");

describe("station board", () => {
  it("maps workflow status to station colour state", () => {
    const b = buildBoard(
      {
        stations: [station("a", 1)],
        appointments: [appt({ status: "washing", started_at: "2026-11-20T08:05:00Z" })],
        unavailability: [],
      },
      now,
    );
    expect(b[0]!.state).toBe("washing");
  });
  it("shows maintenance only when no car is on the bay", () => {
    const unavailability = [
      {
        id: "u",
        station_id: "a",
        starts_at: "2026-11-20T08:00:00Z",
        ends_at: "2026-11-20T10:00:00Z",
        reason: "Pump",
      },
    ];
    expect(
      buildBoard({ stations: [station("a", 1)], appointments: [], unavailability }, now)[0]!.state,
    ).toBe("maintenance");
    expect(
      buildBoard(
        {
          stations: [station("a", 1, { out_of_service: true })],
          appointments: [],
          unavailability: [],
        },
        now,
      )[0]!.state,
    ).toBe("maintenance");
  });
  it("flags delays and a next booking at risk", () => {
    const b = buildBoard(
      {
        stations: [station("a", 1)],
        appointments: [
          appt({ id: "1", status: "washing", estimated_end: "2026-11-20T08:10:00Z" }),
          appt({ id: "2", starts_at: "2026-11-20T08:00:00Z", ends_at: "2026-11-20T09:00:00Z" }),
        ],
        unavailability: [],
      },
      now,
    );
    expect(b[0]!.delayed).toBe(true);
    expect(b[0]!.next?.id).toBe("2");
    expect(b[0]!.nextAtRisk).toBe(true);
  });
});

describe("workflow helpers", () => {
  it("masks plates for public screens", () => {
    expect(maskPlate("AB1234")).toBe("AB••34");
    expect(maskPlate("AB 12")).toBe("A••••".slice(0, 4));
  });
  it("steps forward and back", () => {
    expect(nextStep("confirmed")).toBe("arrived");
    expect(nextStep("ready")).toBe("picked_up");
    expect(nextStep("picked_up")).toBeNull();
    expect(prevStep("washing")).toBe("checked_in");
  });
  it("is delayed only while being worked on", () => {
    expect(isDelayed({ status: "ready", estimated_end: "2026-11-20T08:00:00Z" }, now)).toBe(false);
    expect(
      isDelayed(
        { status: "washing", estimated_end: "2026-11-20T09:00:00Z", delay_minutes: 10 },
        now,
      ),
    ).toBe(true);
  });
});
