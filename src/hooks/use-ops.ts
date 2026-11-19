import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDay, dayBounds } from "@/lib/time";

const LIVE = "arrived,checked_in,washing,exterior_done,interior_done,quality_check,ready";

/** Re-fetch `keys` whenever any of `tables` changes (Supabase Realtime, RLS-filtered). */
export function useLive(tables: string[], keys: string[][]) {
  const qc = useQueryClient();
  const sig = tables.join(",") + "|" + JSON.stringify(keys);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), 250);
    };
    const ch = supabase.channel(`live-${Math.random().toString(36).slice(2)}`);
    for (const table of tables)
      ch.on("postgres_changes", { event: "*", schema: "public", table }, bump);
    ch.subscribe();
    // Catch up after the tab sleeps (tablets, TVs waking up).
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, sig]);
}

/** Today's (and tomorrow's) operations + every car still on site. Live. */
export function useOps() {
  useLive(
    [
      "appointments",
      "stations",
      "station_unavailability",
      "station_employees",
      "extra_work",
      "services",
    ],
    [["ops"]],
  );
  return useQuery({
    queryKey: ["ops"],
    refetchInterval: 60000,
    queryFn: async () => {
      const { from } = dayBounds(localDay(new Date()));
      const to = new Date(from.getTime() + 2 * 86400000);
      const [st, sv, ss, se, un, ap, pr, xw] = await Promise.all([
        supabase.from("stations").select("*").order("number"),
        supabase.from("services").select("*").order("price"),
        supabase.from("station_services").select("*"),
        supabase.from("station_employees").select("*"),
        supabase
          .from("station_unavailability")
          .select("*")
          .gte("ends_at", new Date().toISOString())
          .order("starts_at"),
        supabase
          .from("appointments")
          .select("*")
          .or(`starts_at.gte.${from.toISOString()},status.in.(${LIVE})`)
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("extra_work").select("*").eq("status", "pending").order("created_at"),
      ]);
      const err = [st, sv, ss, se, un, ap, pr, xw].find((r) => r.error)?.error;
      if (err) throw new Error(err.message);
      return {
        stations: st.data!,
        services: sv.data!,
        stationServices: ss.data!,
        stationEmployees: se.data!,
        unavailability: un.data!,
        appointments: ap.data!,
        profiles: pr.data!,
        pendingExtras: xw.data!,
      };
    },
  });
}

export type Ops = NonNullable<ReturnType<typeof useOps>["data"]>;
export type Appointment = Ops["appointments"][number];

export const nameOf = (ops: Pick<Ops, "profiles"> | undefined, id?: string | null) =>
  (id && ops?.profiles.find((p) => p.id === id)?.full_name) || "—";
export const serviceOf = (ops: Pick<Ops, "services"> | undefined, id?: string) =>
  ops?.services.find((s) => s.id === id);
export const stationOf = (ops: Pick<Ops, "stations"> | undefined, id?: string | null) =>
  ops?.stations.find((s) => s.id === id);

/** Ticks every `ms` so time-based labels (clock, "delayed") stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
