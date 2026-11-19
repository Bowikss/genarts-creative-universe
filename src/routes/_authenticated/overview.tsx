import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  CheckCircle2,
  Droplets,
  PartyPopper,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { BoardGrid, Clock as LiveClock, StationTile } from "@/components/board";
import { ExtraRow } from "@/components/appointment-panels";
import { Button } from "@/components/ui/button";
import { nameOf, serviceOf, stationOf, useNow, useOps, type Appointment } from "@/hooks/use-ops";
import { loadMe } from "@/hooks/use-staff";
import { buildBoard } from "@/lib/board";
import { localDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  fmtTime,
  IN_WORK,
  isDelayed,
  isLateArrival,
  STATUS_LABEL,
  type ApptStatus,
} from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/overview")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({ queryKey: ["me"], queryFn: loadMe });
    if (!me?.isManager) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Today — Genarts" },
      { name: "description", content: "Daily operations overview." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { data: ops, isLoading, error } = useOps();
  const now = useNow(30000);
  const navigate = useNavigate();
  if (isLoading || !ops)
    return (
      <div className="min-h-screen">
        <StaffNav />
        <p className="p-6 text-muted-foreground">{error ? error.message : "Loading…"}</p>
      </div>
    );

  const today = localDay(now);
  const todays = ops.appointments.filter(
    (a) => localDay(new Date(a.starts_at)) === today && a.status !== "cancelled",
  );
  const onSite = ops.appointments.filter((a) => IN_WORK.includes(a.status as ApptStatus));
  const ready = ops.appointments.filter((a) => a.status === "ready");
  const delayed = onSite.filter((a) => isDelayed(a, now));
  const late = todays.filter((a) => isLateArrival(a, now));
  const done = todays.filter((a) => a.status === "picked_up");
  const board = buildBoard(ops, now);
  const free = board.filter((c) => c.state === "available");
  const maint = board.filter((c) => c.state === "maintenance");
  const soon = todays.filter(
    (a) =>
      a.status === "confirmed" &&
      !isLateArrival(a, now) &&
      new Date(a.starts_at).getTime() - now.getTime() < 60 * 60000,
  );
  const names = (id?: string | null) => nameOf(ops, id);

  const tiles = [
    { label: "Expected today", value: todays.length, icon: CalendarClock, tone: "text-primary" },
    { label: "Being washed", value: onSite.length, icon: Droplets, tone: "text-st-washing" },
    { label: "Ready for pickup", value: ready.length, icon: PartyPopper, tone: "text-st-ready" },
    {
      label: "Available stations",
      value: `${free.length}/${board.length}`,
      icon: Car,
      tone: "text-st-available",
    },
    {
      label: "Delayed",
      value: delayed.length,
      icon: AlertTriangle,
      tone: delayed.length ? "text-destructive" : "text-muted-foreground",
    },
    {
      label: "Under maintenance",
      value: maint.length,
      icon: Wrench,
      tone: maint.length ? "text-st-maintenance" : "text-muted-foreground",
    },
    { label: "Completed", value: done.length, icon: CheckCircle2, tone: "text-st-available" },
  ];

  const setStatus = async (a: Appointment, s: ApptStatus) => {
    const { error } = await supabase.from("appointments").update({ status: s }).eq("id", a.id);
    if (error) toast.error(error.message);
    else toast.success(`${a.reg_number}: ${STATUS_LABEL[s]}`);
  };

  return (
    <div className="min-h-screen pb-12">
      <StaffNav />
      <main className="px-4 py-4 md:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl md:text-4xl">Today</h1>
          <LiveClock />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-card p-4">
              <t.icon className={cn("size-5", t.tone)} />
              <div className={cn("mt-2 font-display text-3xl", t.tone)}>{t.value}</div>
              <div className="text-sm text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Panel title="Waiting for your approval" count={ops.pendingExtras.length} tone="quality">
            {ops.pendingExtras.length === 0 ? (
              <Empty>No extra-work requests.</Empty>
            ) : (
              <ul className="grid gap-2">
                {ops.pendingExtras.map((x) => {
                  const a = ops.appointments.find((y) => y.id === x.appointment_id);
                  return (
                    <div key={x.id}>
                      {a && (
                        <Link
                          to="/tablet/$id"
                          params={{ id: a.id }}
                          className="plate mb-1 inline-block text-sm"
                        >
                          {a.reg_number}
                        </Link>
                      )}
                      <ExtraRow x={x} names={names} canDecide compact />
                    </div>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Delayed" count={delayed.length} tone="maintenance">
            {delayed.length === 0 ? (
              <Empty>Everything on time.</Empty>
            ) : (
              delayed.map((a) => (
                <Row key={a.id} a={a} ops={ops}>
                  <span className="text-sm text-destructive">
                    ready ≈ {fmtTime(a.estimated_end)}
                    {a.delay_reason ? ` · ${a.delay_reason}` : ""}
                  </span>
                </Row>
              ))
            )}
          </Panel>

          <Panel title="Ready for pickup" count={ready.length} tone="ready">
            {ready.length === 0 ? (
              <Empty>No cars waiting.</Empty>
            ) : (
              ready.map((a) => (
                <Row key={a.id} a={a} ops={ops}>
                  <span className="text-sm text-muted-foreground">since {fmtTime(a.ready_at)}</span>
                  <Button size="sm" onClick={() => setStatus(a, "picked_up")}>
                    Picked up
                  </Button>
                </Row>
              ))
            )}
          </Panel>

          <Panel title="Late arrivals" count={late.length} tone="washing">
            {late.length === 0 ? (
              <Empty>No one is late.</Empty>
            ) : (
              late.map((a) => (
                <Row key={a.id} a={a} ops={ops}>
                  <span className="text-sm text-muted-foreground">
                    booked {fmtTime(a.starts_at)}
                    {a.customer_phone && (
                      <>
                        {" "}
                        ·{" "}
                        <a className="text-primary" href={`tel:${a.customer_phone}`}>
                          {a.customer_phone}
                        </a>
                      </>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setStatus(a, "arrived")}>
                      Arrived
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(a, "cancelled")}>
                      No-show
                    </Button>
                  </div>
                </Row>
              ))
            )}
          </Panel>

          <Panel title="Arriving within the hour" count={soon.length}>
            {soon.length === 0 ? (
              <Empty>Nothing in the next hour.</Empty>
            ) : (
              soon.map((a) => (
                <Row key={a.id} a={a} ops={ops}>
                  <span className="font-mono text-sm font-bold">{fmtTime(a.starts_at)}</span>
                </Row>
              ))
            )}
          </Panel>

          <Panel
            title="Stations under maintenance"
            count={ops.unavailability.length}
            tone="maintenance"
          >
            {ops.unavailability.length === 0 && !board.some((c) => c.station.out_of_service) ? (
              <Empty>All stations in service.</Empty>
            ) : (
              <ul className="grid gap-2 text-sm">
                {board
                  .filter((c) => c.station.out_of_service)
                  .map((c) => (
                    <li key={c.station.id}>
                      <b>
                        #{c.station.number} {c.station.name}
                      </b>{" "}
                      · out of service
                    </li>
                  ))}
                {ops.unavailability.map((u) => {
                  const s = stationOf(ops, u.station_id);
                  const hit = ops.appointments.filter(
                    (a) =>
                      a.station_id === u.station_id &&
                      a.status === "confirmed" &&
                      a.starts_at < u.ends_at &&
                      a.ends_at > u.starts_at,
                  ).length;
                  return (
                    <li key={u.id}>
                      <b>
                        #{s?.number} {s?.name}
                      </b>{" "}
                      · {fmtTime(u.starts_at)}–{fmtTime(u.ends_at)} · {u.reason}
                      {hit > 0 && (
                        <span className="ml-1 font-semibold text-destructive">
                          · {hit} booking{hit > 1 ? "s" : ""} to move
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/admin"
              search={{ tab: "maintenance" }}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Manage maintenance →
            </Link>
          </Panel>
        </div>

        <h2 className="mb-3 mt-8 text-2xl">Stations</h2>
        <BoardGrid dense>
          {board.map((c) => (
            <StationTile
              key={c.station.id}
              number={c.station.number}
              name={c.station.name}
              state={c.state}
              plate={c.current?.reg_number}
              vehicle={
                c.current ? [c.current.make, c.current.model].filter(Boolean).join(" ") : null
              }
              status={c.current?.status}
              service={serviceOf(ops, c.current?.service_id)?.name}
              startedAt={c.current?.started_at}
              startsAt={c.current?.starts_at}
              estimate={c.current?.estimated_end}
              employee={
                c.current
                  ? c.current.assigned_employee
                    ? names(c.current.assigned_employee)
                    : null
                  : undefined
              }
              delayed={c.delayed}
              nextAtRisk={c.nextAtRisk}
              waiting={c.waiting.map((w) => w.reg_number)}
              next={c.next ? { time: c.next.starts_at, plate: c.next.reg_number } : null}
              maintenance={
                c.maintenance
                  ? { until: c.maintenance.ends_at, reason: c.maintenance.reason }
                  : null
              }
              onClick={
                c.current
                  ? () => navigate({ to: "/tablet/$id", params: { id: c.current!.id } })
                  : undefined
              }
            />
          ))}
        </BoardGrid>
      </main>
    </div>
  );
}

const TONE: Record<string, string> = {
  quality: "bg-st-quality",
  maintenance: "bg-st-maintenance",
  ready: "bg-st-ready text-black",
  washing: "bg-st-washing text-black",
};

function Panel({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-lg">
        {title}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold",
            count && tone ? TONE[tone] : "bg-secondary",
          )}
        >
          {count}
        </span>
      </h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

function Row({
  a,
  ops,
  children,
}: {
  a: Appointment;
  ops: Parameters<typeof serviceOf>[0];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
      <Link to="/tablet/$id" params={{ id: a.id }} className="plate text-sm hover:text-primary">
        {a.reg_number}
      </Link>
      <span className="min-w-24 flex-1 truncate text-sm text-muted-foreground">
        {serviceOf(ops, a.service_id)?.name}
      </span>
      {children}
    </div>
  );
}
