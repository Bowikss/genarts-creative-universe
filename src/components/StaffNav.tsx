import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Brand } from "./Brand";
import { useStaff } from "@/hooks/use-staff";
import { useNotifications } from "@/hooks/use-notifications";
import { fmtDateTime, ROLE_LABEL } from "@/lib/workflow";

const KIND_DOT: Record<string, string> = {
  new_appointment: "bg-primary",
  arrived: "bg-st-arrived",
  ready: "bg-st-ready",
  delay: "bg-st-maintenance",
  maintenance: "bg-st-maintenance",
  extra_request: "bg-st-quality",
  extra_decision: "bg-st-quality",
  cancelled: "bg-muted-foreground",
  rescheduled: "bg-st-washing",
  workflow: "bg-st-washing",
};

export function NotificationBell() {
  const { data: me } = useStaff();
  const { items, unread, markSeen, seen } = useNotifications(me?.user.id);
  return (
    <Popover
      onOpenChange={(o) => {
        if (!o) markSeen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unread ? ` (${unread} new)` : ""}`}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="border-b border-border px-4 py-3 font-semibold">Notifications</div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
          {items.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3 border-b border-border/60 px-4 py-3 text-sm ${n.created_at > seen ? "bg-accent/40" : ""}`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND_DOT[n.kind] ?? "bg-muted-foreground"}`}
              />
              <div className="min-w-0">
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StaffNav() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const link =
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap";
  const active = {
    className:
      "rounded-md px-3 py-2 text-sm font-medium bg-secondary text-foreground whitespace-nowrap",
  };
  const role = me?.isAdmin ? "admin" : me?.isManager ? "manager" : "employee";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-2">
        <Brand className="mr-2" />
        <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {me?.isManager && (
            <Link to="/overview" className={link} activeProps={active}>
              Today
            </Link>
          )}
          <Link to="/dashboard" className={link} activeProps={active}>
            Stations
          </Link>
          <Link to="/tablet" className={link} activeProps={active}>
            Tablet
          </Link>
          {me?.isManager && (
            <Link to="/appointments" className={link} activeProps={active}>
              Appointments
            </Link>
          )}
          <Link to="/vehicles" className={link} activeProps={active}>
            Vehicles
          </Link>
          {me?.isManager && (
            <Link to="/admin" className={link} activeProps={active}>
              {me.isAdmin ? "Admin" : "Manage"}
            </Link>
          )}
        </nav>
        <span className="hidden text-right text-xs leading-tight text-muted-foreground lg:block">
          {me?.name}
          <br />
          {ROLE_LABEL[role]}
        </span>
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut />
        </Button>
      </div>
    </header>
  );
}
