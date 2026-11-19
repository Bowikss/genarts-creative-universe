import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE, stationStateFor, type ApptStatus } from "@/lib/workflow";

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export function useOps() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`ops-${Math.random().toString(36).slice(2)}`);
    for (const table of ["appointments", "stations", "station_unavailability", "appointment_notes"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => qc.invalidateQueries({ queryKey: ["ops"] }));
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ["ops"],
    refetchInterval: 60000,
    queryFn: async () => {
      const from = startOfToday();
      const to = new Date(from.getTime() + 2 * 24 * 3600000);
      const [st, sv, ss, se, un, ap, pr] = await Promise.all([
        supabase.from("stations").select("*").order("number"),
        supabase.from("services").select("*").order("price"),
        supabase.from("station_services").select("*"),
        supabase.from("station_employees").select("*"),
        supabase.from("station_unavailability").select("*").gte("ends_at", new Date().toISOString()).order("starts_at"),
        supabase.from("appointments").select("*").gte("starts_at", new Date(from.getTime() - 24 * 3600000).toISOString()).lt("starts_at", to.toISOString()).order("starts_at"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      const err = [st, sv, ss, se, un, ap, pr].find((r) => r.error)?.error;
      if (err) throw new Error(err.message);
      return { stations: st.data!, services: sv.data!, stationServices: ss.data!, stationEmployees: se.data!, unavailability: un.data!, appointments: ap.data!, profiles: pr.data! };
    },
  });
}

export type Ops = NonNullable<ReturnType<typeof useOps>["data"]>;
export type Appointment = Ops["appointments"][number];

export function stationView(ops: Ops, now = new Date()) {
  const nowMs = now.getTime();
  return ops.stations.map((s) => {
    const appts = ops.appointments.filter((a) => a.station_id === s.id && a.status !== "cancelled");
    const current = appts.find((a) => ACTIVE.includes(a.status as ApptStatus)) ?? null;
    const next = appts.find((a) => a.status === "confirmed" && new Date(a.ends_at).getTime() > nowMs) ?? null;
    const maint = ops.unavailability.find((u) => u.station_id === s.id && new Date(u.starts_at).getTime() <= nowMs && new Date(u.ends_at).getTime() > nowMs);
    const unavailable = s.out_of_service || !!maint;
    return {
      station: s, current, next, maintenance: maint ?? null,
      state: stationStateFor((current?.status as ApptStatus) ?? null, unavailable),
      service: (id?: string) => ops.services.find((x) => x.id === id),
      employeeName: (id?: string | null) => ops.profiles.find((p) => p.id === id)?.full_name ?? "—",
    };
  });
}
