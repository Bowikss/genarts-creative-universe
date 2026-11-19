import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/workflow";

export interface Me {
  user: { id: string; email?: string | undefined };
  name: string;
  roles: Role[];
  isAdmin: boolean;
  /** Admin or manager: runs daily operations. */
  isManager: boolean;
  isStaff: boolean;
  stationIds: string[];
}

export async function loadMe(): Promise<Me | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [roles, profile, stations] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("station_employees").select("station_id").eq("user_id", user.id),
  ]);
  const r = (roles.data ?? []).map((x) => x.role as Role);
  const isAdmin = r.includes("admin");
  return {
    user: { id: user.id, email: user.email },
    name: profile.data?.full_name || user.email || "",
    roles: r,
    isAdmin,
    isManager: isAdmin || r.includes("manager"),
    isStaff: r.length > 0,
    stationIds: (stations.data ?? []).map((s) => s.station_id),
  };
}

export function useStaff() {
  return useQuery({ queryKey: ["me"], queryFn: loadMe, staleTime: 60000 });
}
