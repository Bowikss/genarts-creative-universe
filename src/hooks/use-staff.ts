import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useStaff() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const r = (roles ?? []).map((x) => x.role);
      return { user, isAdmin: r.includes("admin"), isStaff: r.length > 0 };
    },
  });
}
