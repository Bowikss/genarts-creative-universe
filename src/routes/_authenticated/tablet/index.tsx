import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Clock } from "lucide-react";
import { StaffNav } from "@/components/StaffNav";
import { useStaff } from "@/hooks/use-staff";
import { serviceOf, useNow, useOps, type Appointment } from "@/hooks/use-ops";
import { buildBoard } from "@/lib/board";
import { localDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  ACTIVE,
  fmtTime,
  isDelayed,
  isLateArrival,
  STATE_BG,
  STATION_STATE_LABEL,
  STATUS_LABEL,
  type ApptStatus,
} from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/tablet/")({
  head: () => ({
    meta: [{ title: "Tablet — Genarts" }, { name: "description", content: "Employee workflow." }],
  }),
  component: Tablet,
});

const FILTER_KEY = "genarts.tablet.station";

function Tablet() {
  const { data: me } = useStaff();
  const { data: ops, isLoading } = useOps();
  const now = useNow(30000);
  const [filter, setFilter] = useState<string>("auto");
  useEffect(() => {
    try {
      const v = localStorage.getItem(FILTER_KEY);
      if (v) setFilter(v);
    } catch {
      /* ignore */
    }
  }, []);
  const pick = (v: string) => {
    setFilter(v);
    try {
      localStorage.setItem(FILTER_KEY, v);
    } catch {
      /* ignore */
    }
  };

  if (isLoading || !ops || !me)
    return (
      <div className="min-h-screen">
        <StaffNav />
        <p className="p-6 text-muted-foreground">Loading…</p>
      </div>
    );

  const mine = me.stationIds;
  const active = filter === "auto" ? (mine.length || !me.isManager ? "mine" : "all") : filter;
  const stations = ops.stations.filter((s) =>
    active === "all"
      ? true
      : active === "mine"
        ? mine.length
          ? mine.includes(s.id)
          : true
        : s.id === active,
  );
  const board = buildBoard({ ...ops, stations }, now);
  const today = localDay(now);

  return (
    <div className="min-h-screen">
      <StaffNav />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-2">
          {(mine.length > 0 || !me.isManager) && (
            <Chip on={active === "mine"} onClick={() => pick("mine")}>
              {mine.length ? "My stations" : "All"}
            </Chip>
          )}
          {me.isManager && (
            <Chip on={active === "all"} onClick={() => pick("all")}>
              All
            </Chip>
          )}
          {ops.stations
            .filter((s) => me.isManager || mine.includes(s.id))
            .map((s) => (
              <Chip key={s.id} on={active === s.id} onClick={() => pick(s.id)}>
                #{s.number} {s.name}
              </Chip>
            ))}
        </div>
        {!me.isManager && mine.length === 0 && (
          <p className="mt-4 rounded-xl border border-border bg-card p-5 text-muted-foreground">
            You aren't assigned to a station yet. Ask your manager.
          </p>
        )}
        <div className="mt-2 grid gap-6">
          {board.map((c) => {
            const queue = ops.appointments
              .filter(
                (a) =>
                  a.station_id === c.station.id &&
                  a.status === "confirmed" &&
                  localDay(new Date(a.starts_at)) === today &&
                  a.id !== c.current?.id,
              )
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const ready = ops.appointments.filter(
              (a) =>
                a.station_id === c.station.id && a.status === "ready" && a.id !== c.current?.id,
            );
            return (
              <section key={c.station.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn("size-3 rounded-full", STATE_BG[c.state])} />
                  <h2 className="text-xl">
                    #{c.station.number} {c.station.name}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {STATION_STATE_LABEL[c.state]}
                  </span>
                </div>
                {c.current ? (
                  <CarRow a={c.current} big ops={ops} now={now} />
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-border p-5 text-muted-foreground">
                    {c.state === "maintenance"
                      ? `Unavailable${c.maintenance ? ` · ${c.maintenance.reason}` : ""}`
                      : "No car on this station."}
                  </div>
                )}
                {ready.map((a) => (
                  <div key={a.id} className="mt-2">
                    <CarRow a={a} ops={ops} now={now} />
                  </div>
                ))}
                {queue.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Next vehicles
                    </p>
                    <div className="grid gap-2">
                      {queue.slice(0, 4).map((a) => (
                        <CarRow key={a.id} a={a} ops={ops} now={now} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-semibold",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
      )}
    >
      {children}
    </button>
  );
}

function CarRow({
  a,
  big,
  ops,
  now,
}: {
  a: Appointment;
  big?: boolean;
  ops: NonNullable<ReturnType<typeof useOps>["data"]>;
  now: Date;
}) {
  const delayed = isDelayed(a, now);
  const late = isLateArrival(a, now);
  const active = ACTIVE.includes(a.status as ApptStatus);
  return (
    <Link
      to="/tablet/$id"
      params={{ id: a.id }}
      className={cn(
        "flex items-center gap-4 rounded-xl border-2 bg-card px-4 transition-colors hover:border-primary",
        big ? "border-primary/60 py-5" : "border-border py-3",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("plate", big ? "text-2xl" : "text-lg")}>{a.reg_number}</span>
          <span className="truncate text-muted-foreground">
            {[a.make, a.model].filter(Boolean).join(" ")}
          </span>
          {delayed && (
            <span className="flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs font-bold text-white">
              <AlertTriangle className="size-3" />
              Delayed
            </span>
          )}
          {late && (
            <span className="rounded bg-st-washing px-2 py-0.5 text-xs font-bold text-black">
              Late
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {fmtTime(a.starts_at)}
          </span>
          <span>{serviceOf(ops, a.service_id)?.name}</span>
          {active && (
            <span className="font-semibold text-foreground">
              {STATUS_LABEL[a.status as ApptStatus]}
            </span>
          )}
          {a.customer_note && <span className="text-st-ready">• note</span>}
        </div>
      </div>
      <ChevronRight className="size-6 shrink-0 text-muted-foreground" />
    </Link>
  );
}
