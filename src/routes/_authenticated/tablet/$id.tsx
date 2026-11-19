import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, History, Loader2, StickyNote, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import {
  DelayPanel,
  ExtraWorkPanel,
  NotesPanel,
  PhotosPanel,
} from "@/components/appointment-panels";
import { useAppointment } from "@/hooks/use-appointment";
import { nameOf, serviceOf, stationOf, useNow, useOps } from "@/hooks/use-ops";
import { useStaff } from "@/hooks/use-staff";
import { cn } from "@/lib/utils";
import {
  EMPLOYEE_STEPS,
  euro,
  fmtDate,
  fmtTime,
  isDelayed,
  nextStep,
  ORDER,
  prevStep,
  STATUS_LABEL,
  type ApptStatus,
} from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/tablet/$id")({
  head: () => ({
    meta: [{ title: "Vehicle — Genarts" }, { name: "description", content: "Vehicle workflow." }],
  }),
  component: Workflow,
});

function Workflow() {
  const { id } = Route.useParams();
  const { data: me } = useStaff();
  const { data: ops } = useOps();
  const { data: d, isLoading, error } = useAppointment(id);
  const now = useNow(30000);
  const [busy, setBusy] = useState<ApptStatus | null>(null);

  if (isLoading || !me)
    return (
      <Page>
        <p className="text-muted-foreground">Loading…</p>
      </Page>
    );
  if (error)
    return (
      <Page>
        <p className="text-destructive">{error.message}</p>
      </Page>
    );
  const a = d?.appt;
  if (!a || !d)
    return (
      <Page>
        <p className="text-muted-foreground">
          This vehicle isn't on your stations (or was removed).
        </p>
      </Page>
    );

  const status = a.status as ApptStatus;
  const names = (uid?: string | null) => nameOf(ops, uid);
  const svc = serviceOf(ops, a.service_id);
  const st = stationOf(ops, a.station_id);
  const nx = nextStep(status);
  const prev = prevStep(status);
  const idx = ORDER.indexOf(status);
  const lastEvent = (s: ApptStatus) => [...d.events].reverse().find((e) => e.step === s);
  const closed = status === "picked_up" || status === "cancelled";
  const delayed = isDelayed(a, now);

  const setStatus = async (s: ApptStatus) => {
    setBusy(s);
    const { error } = await supabase.from("appointments").update({ status: s }).eq("id", id);
    setBusy(null);
    if (error) toast.error(error.message);
    else if (s === "ready") toast.success("Ready for pickup — customer notified");
  };

  const nextForStation = ops?.appointments
    .filter(
      (x) =>
        x.station_id === a.station_id &&
        x.status === "confirmed" &&
        x.id !== a.id &&
        x.starts_at >= a.starts_at,
    )
    .sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0];

  return (
    <Page>
      <Link
        to="/tablet"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All vehicles
      </Link>

      {/* Vehicle header */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="plate text-3xl">{a.reg_number}</span>
          <span className="text-xl font-semibold">
            {[a.make, a.model].filter(Boolean).join(" ")}
          </span>
          {delayed && (
            <span className="flex items-center gap-1 rounded bg-destructive px-2 py-1 text-sm font-bold text-white">
              <AlertTriangle className="size-4" />
              Delayed
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <KV k="Service" v={svc?.name ?? "—"} />
          <KV k="Station" v={st ? `#${st.number} ${st.name}` : "—"} />
          <KV k="Booked" v={`${fmtDate(a.starts_at)} ${fmtTime(a.starts_at)}`} />
          <KV k="Ready ≈" v={fmtTime(a.estimated_end)} hl={delayed} />
          <KV k="Customer" v={a.customer_name} />
          <KV k="Status" v={STATUS_LABEL[status]} />
          {Number(a.extra_price) > 0 && <KV k="Extras" v={`+${euro(a.extra_price)}`} />}
          {a.delay_minutes > 0 && <KV k="Delay" v={`+${a.delay_minutes} min`} hl />}
        </div>
        {a.customer_note && (
          <p className="mt-3 flex gap-2 rounded-lg border border-st-ready/50 bg-st-ready/10 px-3 py-2 text-sm">
            <StickyNote className="size-4 shrink-0 text-st-ready" />
            <span>
              <b>Customer note:</b> {a.customer_note}
            </span>
          </p>
        )}
        <Link
          to="/vehicles/$reg"
          params={{ reg: a.reg_number }}
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <History className="size-4" />
          Vehicle history
        </Link>
      </div>

      {/* Workflow buttons */}
      <div className="mt-4 grid gap-3">
        {status === "cancelled" && (
          <p className="rounded-xl bg-secondary p-4 text-center font-semibold">
            This appointment was cancelled.
          </p>
        )}
        {EMPLOYEE_STEPS.map((s) => {
          const sIdx = ORDER.indexOf(s.status);
          const done = sIdx <= idx && status !== "cancelled";
          const isNext = s.status === nx;
          const ev = lastEvent(s.status);
          return (
            <Button
              key={s.status}
              variant={isNext ? "stepNext" : "step"}
              disabled={done || closed || busy !== null}
              onClick={() => setStatus(s.status)}
              className={cn(
                done &&
                  "border-st-available/50 bg-st-available/10 opacity-100 disabled:opacity-100",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-full border-2 text-base",
                  done
                    ? "border-st-available bg-st-available text-black"
                    : isNext
                      ? "border-primary-foreground"
                      : "border-border",
                )}
              >
                {busy === s.status ? <Loader2 className="animate-spin" /> : done ? <Check /> : sIdx}
              </span>
              <span className="flex-1">{s.label}</span>
              {done && ev && (
                <span className="text-right text-sm font-normal text-muted-foreground">
                  {fmtTime(ev.created_at)}
                  <br />
                  {names(ev.performed_by)}
                </span>
              )}
            </Button>
          );
        })}
        {prev && status !== "cancelled" && status !== "confirmed" && (
          <Button
            variant="ghost"
            className="h-12 justify-self-start"
            disabled={busy !== null}
            onClick={() => setStatus(prev)}
          >
            <Undo2 />
            Undo “{STATUS_LABEL[status]}”
          </Button>
        )}
      </div>

      {/* Next vehicle for this station */}
      {nextForStation && (
        <Link
          to="/tablet/$id"
          params={{ id: nextForStation.id }}
          className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-border p-4 hover:border-primary"
        >
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Next on this station
          </span>
          <span className="font-mono font-bold">{fmtTime(nextForStation.starts_at)}</span>
          <span className="plate">{nextForStation.reg_number}</span>
          <span className="truncate text-sm text-muted-foreground">
            {serviceOf(ops, nextForStation.service_id)?.name}
          </span>
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ExtraWorkPanel id={id} me={me.user.id} d={d} names={names} canDecide={me.isManager} />
        <DelayPanel id={id} me={me.user.id} d={d} names={names} />
        <PhotosPanel id={id} me={me.user.id} d={d} />
        <NotesPanel id={id} me={me.user.id} d={d} names={names} />
      </div>
    </Page>
  );
}

function KV({ k, v, hl }: { k: string; v: string; hl?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{k}</div>
      <div className={cn("font-semibold", hl && "text-destructive")}>{v}</div>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-16">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-4">{children}</main>
    </div>
  );
}
