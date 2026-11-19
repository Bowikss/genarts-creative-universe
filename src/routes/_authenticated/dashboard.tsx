import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EyeOff } from "lucide-react";
import { StaffNav } from "@/components/StaffNav";
import {
  BoardGrid,
  Clock,
  FullscreenButton,
  Legend,
  StationTile,
  UpcomingList,
  useFullscreen,
} from "@/components/board";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { nameOf, serviceOf, stationOf, useNow, useOps } from "@/hooks/use-ops";
import { buildBoard, upcoming } from "@/lib/board";
import { isLateArrival, maskPlate } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ public: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Stations — Genarts" },
      { name: "description", content: "Live washing station dashboard." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { public: pub = false } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const { data: ops, isLoading, error } = useOps();
  const now = useNow(15000);
  const fs = useFullscreen();
  const board = ops ? buildBoard(ops, now) : [];
  const up = ops ? upcoming(ops.appointments, now, 14) : [];

  return (
    <div className="min-h-screen">
      {!fs.on && <StaffNav />}
      <main className="px-4 py-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl">Washing stations</h1>
            <Legend className="mt-2" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="pub"
                checked={pub}
                onCheckedChange={(v) => navigate({ search: { public: v || undefined } })}
              />
              <Label htmlFor="pub" className="flex items-center gap-1.5">
                <EyeOff className="size-4" />
                Public mode
              </Label>
            </div>
            <FullscreenButton />
            <Clock />
          </div>
        </div>
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {ops && board.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
            No stations visible. Ask a manager to assign you to a station.
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <BoardGrid>
            {board.map((c) => {
              const a = c.current;
              return (
                <StationTile
                  key={c.station.id}
                  number={c.station.number}
                  name={c.station.name}
                  state={c.state}
                  plate={a ? (pub ? maskPlate(a.reg_number) : a.reg_number) : null}
                  vehicle={a && !pub ? [a.make, a.model].filter(Boolean).join(" ") || null : null}
                  customer={a && !pub ? a.customer_name : null}
                  status={a?.status}
                  service={serviceOf(ops, a?.service_id)?.name}
                  startedAt={a?.started_at}
                  startsAt={a?.starts_at}
                  estimate={a?.estimated_end}
                  employee={
                    pub ? undefined : a?.assigned_employee ? nameOf(ops, a.assigned_employee) : null
                  }
                  delayed={c.delayed}
                  nextAtRisk={c.nextAtRisk}
                  waiting={c.waiting.map((w) => (pub ? maskPlate(w.reg_number) : w.reg_number))}
                  next={
                    c.next
                      ? {
                          time: c.next.starts_at,
                          plate: pub ? maskPlate(c.next.reg_number) : c.next.reg_number,
                        }
                      : null
                  }
                  maintenance={
                    c.maintenance
                      ? { until: c.maintenance.ends_at, reason: c.maintenance.reason }
                      : null
                  }
                  onClick={
                    a && !pub
                      ? () => navigate({ to: "/tablet/$id", params: { id: a.id } })
                      : undefined
                  }
                  big
                />
              );
            })}
          </BoardGrid>
          <UpcomingList
            items={up.map((u) => ({
              id: u.id,
              time: u.starts_at,
              plate: pub ? maskPlate(u.reg_number) : u.reg_number,
              service: serviceOf(ops, u.service_id)?.name ?? "",
              station: stationOf(ops, u.station_id)?.number ?? null,
              extra: pub ? null : [u.make, u.model].filter(Boolean).join(" ") || null,
              late: isLateArrival(u, now),
            }))}
          />
        </div>
      </main>
    </div>
  );
}
