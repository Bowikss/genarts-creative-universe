import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SEEN_KEY = "genarts.notifications.seen";
const LOUD = new Set([
  "new_appointment",
  "arrived",
  "ready",
  "delay",
  "extra_request",
  "maintenance",
  "cancelled",
]);

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Internal operational notifications (RLS-scoped), live, with unread count. */
export function useNotifications(myId?: string) {
  const qc = useQueryClient();
  const [seen, setSeen] = useState(readSeen);
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ops_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 120000,
  });
  useEffect(() => {
    const ch = supabase
      .channel(`notif-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ops_notifications" },
        (p) => {
          const n = p.new as { kind: string; title: string; body: string; actor: string | null };
          qc.invalidateQueries({ queryKey: ["notifications"] });
          if (LOUD.has(n.kind) && n.actor !== myId)
            toast(n.title, { description: n.body || undefined });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, myId]);
  const unread = (q.data ?? []).filter((n) => n.created_at > seen && n.actor !== myId).length;
  const markSeen = () => {
    const latest = q.data?.[0]?.created_at ?? new Date().toISOString();
    try {
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      /* private mode */
    }
    setSeen(latest);
  };
  return { items: q.data ?? [], unread, markSeen, seen };
}
