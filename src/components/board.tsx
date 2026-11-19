import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Maximize, Minimize, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-ops";
import { cn } from "@/lib/utils";
import {
  BUSINESS_TZ,
  fmtTime,
  STATE_BG,
  STATE_BORDER,
  STATE_TEXT,
  STATION_STATE_LABEL,
  STATUS_LABEL,
  type ApptStatus,
  type StationState,
} from "@/lib/workflow";

export function Clock({ className }: { className?: string }) {
  const now = useNow(1000);
  return (
    <div className={cn("text-right", className)}>
      <div className="font-mono text-4xl font-bold tabular-nums leading-none md:text-5xl">
        {new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: BUSINESS_TZ,
        }).format(now)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground md:text-base">
        {new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: BUSINESS_TZ,
        }).format(now)}
      </div>
    </div>
  );
}

export function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);
  return { on, toggle };
}

export function FullscreenButton() {
  const { on, toggle } = useFullscreen();
  return (
    <Button variant="outline" size="sm" onClick={toggle}>
      {on ? <Minimize /> : <Maximize />}
      {on ? "Exit full screen" : "Full screen"}
    </Button>
  );
}

const LEGEND: StationState[] = [
  "available",
  "arrived",
  "washing",
  "quality",
  "ready",
  "maintenance",
];
export function Legend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground", className)}>
      {LEGEND.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", STATE_BG[s])} />
          {STATION_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export interface TileProps {
  number: number;
  name: string;
  state: StationState;
  plate?: string | null | undefined;
  vehicle?: string | null | undefined;
  customer?: string | null | undefined;
  status?: string | null | undefined;
  service?: string | null | undefined;
  startedAt?: string | null | undefined;
  startsAt?: string | null | undefined;
  estimate?: string | null | undefined;
  employee?: string | null | undefined;
  delayed?: boolean | undefined;
  nextAtRisk?: boolean | undefined;
  next?: { time: string; plate?: string | null | undefined } | null | undefined;
  maintenance?: { until: string; reason?: string | undefined } | null | undefined;
  onClick?: (() => unknown) | undefined;
  big?: boolean | undefined;
  waiting?: string[] | undefined;
}

/** One washing station. Colour = state; everything readable from across the room. */
export function StationTile(p: TileProps) {
  const hasCar = !!p.plate;
  return (
    <div
      onClick={p.onClick}
      role={p.onClick ? "button" : undefined}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-colors",
        STATE_BORDER[p.state],
        p.onClick && "cursor-pointer hover:bg-accent/40",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-4 py-2.5 text-black",
          STATE_BG[p.state],
          p.state === "washing" && "animate-pulse-soft",
        )}
      >
        <span className="font-display text-lg leading-tight">
          #{p.number} {p.name}
        </span>
        <span className="text-right text-xs font-bold uppercase tracking-wide">
          {STATION_STATE_LABEL[p.state]}
        </span>
      </div>
      <div className={cn("flex flex-1 flex-col gap-3 p-4", p.big && "md:p-5")}>
        {hasCar ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("plate", p.big ? "text-3xl" : "text-2xl")}>{p.plate}</span>
              {p.delayed && (
                <span className="flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs font-bold uppercase text-white">
                  <AlertTriangle className="size-3.5" />
                  Delayed
                </span>
              )}
            </div>
            {(p.vehicle || p.customer) && (
              <div className="leading-snug">
                {p.vehicle && <div className="font-semibold">{p.vehicle}</div>}
                {p.customer && <div className="text-sm text-muted-foreground">{p.customer}</div>}
              </div>
            )}
            <div className={cn("text-lg font-bold", STATE_TEXT[p.state])}>
              {p.status ? STATUS_LABEL[p.status as ApptStatus] : ""}
              {p.service ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{p.service}</span>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Started</dt>
                <dd className="font-mono text-base font-bold">
                  {fmtTime(p.startedAt) === "—"
                    ? `booked ${fmtTime(p.startsAt)}`
                    : fmtTime(p.startedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Ready ≈</dt>
                <dd
                  className={cn("font-mono text-base font-bold", p.delayed && "text-destructive")}
                >
                  {fmtTime(p.estimate)}
                </dd>
              </div>
            </dl>
            {p.employee !== undefined && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="size-4" />
                {p.employee ?? "Not assigned yet"}
              </div>
            )}
          </>
        ) : p.state === "maintenance" ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-1 py-4">
            <Wrench className="size-8 text-st-maintenance" />
            <p className="font-semibold">{p.maintenance?.reason || "Out of service"}</p>
            {p.maintenance && (
              <p className="text-sm text-muted-foreground">until {fmtTime(p.maintenance.until)}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center py-4 text-2xl font-display text-st-available">
            Free
          </div>
        )}
        {p.waiting && p.waiting.length > 0 && (
          <div className="rounded-lg bg-st-ready/15 px-3 py-1.5 text-sm">
            <span className="font-semibold text-st-ready">Waiting for pickup:</span>{" "}
            {p.waiting.join(", ")}
          </div>
        )}
        <div
          className={cn(
            "mt-auto rounded-lg border border-border px-3 py-2 text-sm",
            p.nextAtRisk && "border-st-washing bg-st-washing/10",
          )}
        >
          <span className="text-xs uppercase text-muted-foreground">Next </span>
          {p.next ? (
            <span className="font-semibold">
              <span className="font-mono">{fmtTime(p.next.time)}</span>
              {p.next.plate ? ` · ${p.next.plate}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">nothing booked</span>
          )}
          {p.nextAtRisk && (
            <span className="ml-1 text-xs font-semibold text-st-washing">· running late</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpcomingList({
  items,
}: {
  items: {
    id: string;
    time: string;
    plate: string;
    service: string;
    station?: number | null;
    extra?: string | null;
    late?: boolean;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3 font-display">Upcoming</div>
      {items.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No more appointments booked.</p>
      )}
      <ul>
        {items.map((u) => (
          <li
            key={u.id}
            className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-0"
          >
            <span className={cn("font-mono text-lg font-bold", u.late && "text-destructive")}>
              {fmtTime(u.time)}
            </span>
            <span className="plate text-sm">{u.plate}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {u.service}
              {u.extra ? ` · ${u.extra}` : ""}
            </span>
            {u.station != null && (
              <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold">
                #{u.station}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Responsive grid that fits any number of stations. */
export function BoardGrid({ children, dense }: { children: React.ReactNode; dense?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        dense
          ? "grid-cols-[repeat(auto-fill,minmax(250px,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]",
      )}
    >
      {children}
    </div>
  );
}
