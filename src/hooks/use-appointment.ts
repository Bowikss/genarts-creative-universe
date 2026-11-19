import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLive } from "./use-ops";

/** One appointment with everything that hangs off it. Live. */
export function useAppointment(id: string) {
  useLive(
    [
      "appointments",
      "appointment_events",
      "appointment_notes",
      "appointment_photos",
      "extra_work",
      "appointment_delays",
    ],
    [["appt", id]],
  );
  return useQuery({
    queryKey: ["appt", id],
    queryFn: async () => {
      const [a, ev, notes, photos, extras, delays] = await Promise.all([
        supabase.from("appointments").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("appointment_events")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at"),
        supabase
          .from("appointment_notes")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("appointment_photos")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("extra_work")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("appointment_delays")
          .select("*")
          .eq("appointment_id", id)
          .order("created_at", { ascending: false }),
      ]);
      const err = [a, ev, notes, photos, extras, delays].find((r) => r.error)?.error;
      if (err) throw new Error(err.message);
      let urls: Record<string, string> = {};
      if (photos.data?.length) {
        const { data } = await supabase.storage.from("vehicle-photos").createSignedUrls(
          photos.data.map((p) => p.path),
          3600,
        );
        urls = Object.fromEntries(
          (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])),
        );
      }
      return {
        appt: a.data,
        events: ev.data!,
        notes: notes.data!,
        extras: extras.data!,
        delays: delays.data!,
        photos: photos.data!.map((p) => ({ ...p, url: urls[p.path] })),
      };
    },
  });
}
export type ApptDetail = NonNullable<ReturnType<typeof useAppointment>["data"]>;
