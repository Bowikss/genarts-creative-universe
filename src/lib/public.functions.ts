import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { alternatives, daySlots, pickStation, type AStation } from "./assignment";
import { addDays, dayBounds, localDay } from "./time";
import { buildBoard, upcoming } from "./board";
import { maskPlate } from "./workflow";

// Public (no login) server functions. They use the service-role client, so every one of
// them validates its input and returns only fields that are safe for the public.

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Admin = Awaited<ReturnType<typeof admin>>;

const BOOK_AHEAD_DAYS = 60;
const MIN_LEAD_MS = 10 * 60000;

/** Stations (with the services they support), live bookings and maintenance overlapping [from, to). */
async function loadSchedule(db: Admin, from: Date, to: Date) {
  const [stations, links, appts, unav] = await Promise.all([
    db.from("stations").select("id,number,open_time,close_time,out_of_service"),
    db.from("station_services").select("station_id,service_id"),
    db
      .from("appointments")
      .select("id,station_id,starts_at,ends_at,busy_until")
      .neq("status", "cancelled")
      .lt("starts_at", to.toISOString())
      .gt("busy_until", from.toISOString()),
    db
      .from("station_unavailability")
      .select("station_id,starts_at,ends_at")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
  ]);
  const err = [stations, links, appts, unav].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const st: AStation[] = (stations.data ?? []).map((s) => ({
    ...s,
    serviceIds: (links.data ?? []).filter((l) => l.station_id === s.id).map((l) => l.service_id),
  }));
  return { stations: st, appointments: appts.data ?? [], unavailability: unav.data ?? [] };
}

async function activeService(db: Admin, id: string) {
  const { data } = await db
    .from("services")
    .select("id,name,duration_min,price")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("This service is not available.");
  return data;
}

export const getServices = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("services")
    .select("id,name,duration_min,price")
    .eq("active", true)
    .order("price");
  if (error) throw new Error(error.message);
  return data;
});

const dayRe = /^\d{4}-\d{2}-\d{2}$/;

/** Free start times for a service on one day. */
export const getAvailability = createServerFn({ method: "GET" })
  .validator((i: { service_id: string; day: string }) =>
    z.object({ service_id: z.string().uuid(), day: z.string().regex(dayRe) }).parse(i),
  )
  .handler(async ({ data }) => {
    const today = localDay(new Date());
    if (data.day < today || data.day > addDays(today, BOOK_AHEAD_DAYS))
      return { slots: [] as string[] };
    const db = await admin();
    const svc = await activeService(db, data.service_id);
    const { from, to } = dayBounds(data.day);
    const sched = await loadSchedule(db, from, to);
    const slots = daySlots({
      ...sched,
      serviceId: svc.id,
      durationMin: svc.duration_min,
      day: data.day,
      notBefore: new Date(Date.now() + MIN_LEAD_MS),
    });
    return { slots: slots.map((s) => s.start.toISOString()) };
  });

const bookingSchema = z.object({
  customer_name: z.string().trim().min(2, "Please enter your name").max(100),
  customer_phone: z
    .string()
    .trim()
    .min(6, "Please enter a phone number")
    .max(40)
    .regex(/^[+\d\s()-]+$/, "Phone number looks wrong"),
  customer_email: z
    .string()
    .trim()
    .email("E-mail looks wrong")
    .max(200)
    .or(z.literal(""))
    .default(""),
  reg_number: z
    .string()
    .trim()
    .min(2, "Please enter the registration number")
    .max(12)
    .regex(/^[A-Za-z0-9\s-]+$/, "Use letters and numbers only"),
  make: z.string().trim().max(50).default(""),
  model: z.string().trim().max(50).default(""),
  customer_note: z.string().trim().max(500).default(""),
  notify_customer: z.boolean().default(true),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  website: z.string().max(0).optional(), // honeypot: bots fill every field
});
export type BookingInput = z.input<typeof bookingSchema>;

/**
 * Books a slot. The station is picked on the server; the database's no-overlap constraint
 * makes it safe when two customers grab the same slot at once — the loser is retried on the
 * next best station, and if none is left the customer gets the closest free times instead.
 */
export const createBooking = createServerFn({ method: "POST" })
  .validator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { website: _hp, ...fields } = data;
    const svc = await activeService(db, data.service_id);
    const start = new Date(data.starts_at);
    if (start.getTime() < Date.now() + MIN_LEAD_MS - 60000)
      throw new Error("Please choose a time at least 10 minutes from now.");
    if (localDay(start) > addDays(localDay(new Date()), BOOK_AHEAD_DAYS))
      throw new Error("Bookings open 60 days ahead.");
    const end = new Date(start.getTime() + svc.duration_min * 60000);

    for (let attempt = 0; attempt < 4; attempt++) {
      const sched = await loadSchedule(
        db,
        new Date(start.getTime() - 86400000),
        new Date(end.getTime() + 86400000),
      );
      const station = pickStation({ ...sched, serviceId: svc.id, start, end });
      if (!station) {
        const { from } = dayBounds(localDay(start));
        const wide = await loadSchedule(db, from, new Date(from.getTime() + 9 * 86400000));
        const alts = alternatives({
          ...wide,
          serviceId: svc.id,
          durationMin: svc.duration_min,
          wanted: start,
          notBefore: new Date(Date.now() + MIN_LEAD_MS),
        });
        return { ok: false as const, alternatives: alts.map((d) => d.toISOString()) };
      }
      const { data: created, error } = await db
        .from("appointments")
        .insert({
          ...fields,
          station_id: station.id,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
        })
        .select("tracking_token")
        .single();
      if (!error) return { ok: true as const, token: created.tracking_token as string };
      if (error.code !== "23P01") throw new Error(error.message); // 23P01 = overlap, someone was faster
    }
    throw new Error("That time was just taken. Please pick another time.");
  });

const tokenSchema = z.string().regex(/^[a-f0-9]{32,64}$/);

/** Customer tracking: only this appointment, no internal notes, no staff names. */
export const getTracking = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => ({ token: tokenSchema.parse(input.token) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: a } = await db
      .from("appointments")
      .select(
        "id,reg_number,make,model,starts_at,ends_at,status,started_at,ready_at,completed_at,estimated_end,extra_price,delay_minutes,services(name,duration_min,price),stations(number,name)",
      )
      .eq("tracking_token", data.token)
      .maybeSingle();
    if (!a) return null;
    const [events, messages, extras] = await Promise.all([
      db
        .from("appointment_events")
        .select("step,created_at")
        .eq("appointment_id", a.id)
        .order("created_at"),
      db
        .from("customer_messages")
        .select("body,kind,created_at")
        .eq("appointment_id", a.id)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("extra_work")
        .select("title,price")
        .eq("appointment_id", a.id)
        .eq("status", "approved")
        .order("created_at"),
    ]);
    const { id: _id, ...safe } = a;
    const total = Number(a.services?.price ?? 0) + Number(a.extra_price ?? 0);
    return {
      ...safe,
      total,
      events: events.data ?? [],
      messages: messages.data ?? [],
      extras: extras.data ?? [],
    };
  });

/** Public lobby TV: station states with masked plates, no customer names. Needs the display key. */
export const getDisplay = createServerFn({ method: "GET" })
  .validator((input: { key: string }) => ({
    key: z
      .string()
      .regex(/^[a-f0-9]{16,64}$/)
      .parse(input.key),
  }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: settings } = await db
      .from("settings")
      .select("display_key,business_name")
      .eq("id", 1)
      .maybeSingle();
    if (!settings || settings.display_key !== data.key) return null;
    const now = new Date();
    const { from } = dayBounds(localDay(now));
    const [st, sv, ap, un] = await Promise.all([
      db
        .from("stations")
        .select("id,number,name,out_of_service,open_time,close_time")
        .order("number"),
      db.from("services").select("id,name,duration_min,price"),
      db
        .from("appointments")
        .select(
          "id,station_id,service_id,status,starts_at,ends_at,started_at,estimated_end,delay_minutes,reg_number,make,model,customer_name,assigned_employee",
        )
        .or(
          `starts_at.gte.${from.toISOString()},status.in.(arrived,checked_in,washing,exterior_done,interior_done,quality_check,ready)`,
        )
        .lt("starts_at", new Date(from.getTime() + 2 * 86400000).toISOString())
        .neq("status", "cancelled"),
      db
        .from("station_unavailability")
        .select("id,station_id,starts_at,ends_at,reason")
        .gt("ends_at", now.toISOString()),
    ]);
    const svcName = (id: string) => sv.data?.find((s) => s.id === id)?.name ?? "";
    const pub = (a: NonNullable<typeof ap.data>[number] | null) =>
      a && {
        plate: maskPlate(a.reg_number),
        status: a.status,
        service: svcName(a.service_id),
        starts_at: a.starts_at,
        started_at: a.started_at,
        estimated_end: a.estimated_end,
      };
    const board = buildBoard(
      { stations: st.data ?? [], appointments: ap.data ?? [], unavailability: un.data ?? [] },
      now,
    );
    return {
      business: settings.business_name,
      now: now.toISOString(),
      stations: board.map((c) => ({
        number: c.station.number,
        name: c.station.name,
        state: c.state,
        delayed: c.delayed,
        waiting: c.waiting.map((w) => maskPlate(w.reg_number)),
        current: pub(c.current),
        next: c.next ? { starts_at: c.next.starts_at } : null,
        maintenanceUntil: c.maintenance?.ends_at ?? null,
      })),
      upcoming: upcoming(ap.data ?? [], now, 10).map((a) => ({
        ...pub(a)!,
        station: st.data?.find((s) => s.id === a.station_id)?.number ?? null,
      })),
    };
  });
