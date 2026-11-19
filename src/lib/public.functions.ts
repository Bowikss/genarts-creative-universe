import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pickStation } from "./assignment";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getServices = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db.from("services").select("id,name,duration_min,price").eq("active", true).order("price");
  if (error) throw new Error(error.message);
  return data;
});

const bookingSchema = z.object({
  customer_name: z.string().trim().min(1).max(100),
  customer_phone: z.string().trim().max(40).default(""),
  customer_email: z.string().trim().email().max(200).or(z.literal("")).default(""),
  reg_number: z.string().trim().min(1).max(20),
  make: z.string().trim().max(50).default(""),
  model: z.string().trim().max(50).default(""),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime(),
});

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: service } = await db.from("services").select("id,duration_min").eq("id", data.service_id).eq("active", true).single();
    if (!service) throw new Error("Service not found");
    const start = new Date(data.starts_at);
    if (start.getTime() < Date.now() - 5 * 60000) throw new Error("Please choose a time in the future");
    const end = new Date(start.getTime() + service.duration_min * 60000);
    const dayStart = new Date(start.getTime() - 24 * 3600000).toISOString();
    const dayEnd = new Date(start.getTime() + 24 * 3600000).toISOString();
    const [stations, links, appts, unav] = await Promise.all([
      db.from("stations").select("id,number,open_time,close_time,out_of_service"),
      db.from("station_services").select("station_id,service_id"),
      db.from("appointments").select("station_id,starts_at,ends_at").neq("status", "cancelled").gte("starts_at", dayStart).lte("starts_at", dayEnd),
      db.from("station_unavailability").select("station_id,starts_at,ends_at").lte("starts_at", dayEnd).gte("ends_at", dayStart),
    ]);
    const station = pickStation({
      stations: (stations.data ?? []).map((s) => ({ ...s, serviceIds: (links.data ?? []).filter((l) => l.station_id === s.id).map((l) => l.service_id) })),
      serviceId: service.id, start, end, appointments: appts.data ?? [], unavailability: unav.data ?? [],
    });
    if (!station) throw new Error("No washing station is free at that time. Please pick another time.");
    const { data: created, error } = await db.from("appointments").insert({
      ...data, reg_number: data.reg_number.toUpperCase(), station_id: station.id,
      starts_at: start.toISOString(), ends_at: end.toISOString(),
    }).select("tracking_token").single();
    if (error) throw new Error(error.message);
    return { token: created.tracking_token as string };
  });

export const getTracking = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: z.string().regex(/^[a-f0-9]{32,64}$/).parse(input.token) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: a } = await db.from("appointments")
      .select("id,reg_number,make,model,starts_at,ends_at,status,started_at,completed_at,services(name,duration_min),stations(number,name)")
      .eq("tracking_token", data.token).maybeSingle();
    if (!a) return null;
    const { data: events } = await db.from("appointment_events").select("step,created_at").eq("appointment_id", a.id).order("created_at");
    const { id: _id, ...safe } = a;
    let estimate: string | null = null;
    if (a.started_at && a.services) estimate = new Date(new Date(a.started_at).getTime() + a.services.duration_min * 60000).toISOString();
    return { ...safe, estimate, events: events ?? [] };
  });
