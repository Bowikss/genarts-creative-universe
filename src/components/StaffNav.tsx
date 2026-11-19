import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "./Brand";
import { useStaff } from "@/hooks/use-staff";

export function StaffNav() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const link = "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground";
  const active = { className: "rounded-md px-3 py-2 text-sm font-medium bg-secondary text-foreground" };
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <Brand className="mr-4" />
      <nav className="flex flex-wrap gap-1">
        <Link to="/dashboard" className={link} activeProps={active}>Station Dashboard</Link>
        <Link to="/tablet" className={link} activeProps={active}>Tablet</Link>
        {me?.isAdmin && <Link to="/admin" className={link} activeProps={active}>Admin</Link>}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
        <span className="hidden sm:inline">{me?.user.email}{me?.isAdmin ? " · Admin" : ""}</span>
        <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
      </div>
    </header>
  );
}
