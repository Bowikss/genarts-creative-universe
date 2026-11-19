import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { useStaff } from "@/hooks/use-staff";
import { cn } from "@/lib/utils";
import { euro, fmtDate, fmtDateTime, fmtTime, STATUS_LABEL, type ApptStatus } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/vehicles/$reg")({
  head: () => ({
    meta: [{ title: "Vehicle — Genarts" }, { name: "description", content: "Vehicle history." }],
  }),
  component: VehicleHistory,
});

interface Visit {
  id: string;
  reg_number: string;
  make: string;
  model: string;
  customer_name: string;
  customer_note: string;
  starts_at: string;
  status: ApptStatus;
  started_at: string | null;
  completed_at: string | null;
  extra_price: number;
  delay_minutes: number;
  delay_reason: string;
  service: string;
  service_price: number;
  station_number: number | null;
  station_name: string | null;
  employee: string | null;
  events: { step: ApptStatus; at: string; by: string | null }[];
  notes: { kind: string; body: string; at: string; by: string | null }[];
  extras: { title: string; price: number; status: string }[];
}

function VehicleHistory() {
  const { reg } = Route.useParams();
  const { data: me } = useStaff();
  const q = useQuery({
    queryKey: ["history", reg],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vehicle_history", { _reg: reg });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Visit[];
    },
  });
  const visits = q.data ?? [];
  const done = visits.filter((v) => v.status === "picked_up");
  const latest = visits[0];
  const spent = done.reduce((s, v) => s + Number(v.service_price) + Number(v.extra_price), 0);

  return (
    <div className="min-h-screen pb-12">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 py-4">
        <Link
          to="/vehicles"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All vehicles
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="plate text-3xl">{reg}</span>
          {latest && (
            <span className="text-xl font-semibold">
              {[latest.make, latest.model].filter(Boolean).join(" ")}
            </span>
          )}
        </div>
        {q.isLoading && <p className="mt-4 text-muted-foreground">Loading…</p>}
        {q.error && <p className="mt-4 text-destructive">{q.error.message}</p>}
        {q.data && visits.length === 0 && (
          <p className="mt-4 text-muted-foreground">No visits for this vehicle.</p>
        )}
        {visits.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Visits" v={String(done.length)} />
            <Stat k="Last visit" v={fmtDate((done[0] ?? latest)!.starts_at)} />
            <Stat k="Customer" v={latest!.customer_name} />
            {me?.isManager && <Stat k="Total spent" v={euro(spent)} />}
          </div>
        )}
        <ol className="mt-6 grid gap-4">
          {visits.map((v) => (
            <li
              key={v.id}
              className={cn(
                "rounded-2xl border border-border bg-card p-4",
                v.status === "cancelled" && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-lg">
                  {fmtDate(v.starts_at)} · {fmtTime(v.starts_at)}
                </span>
                <span className="font-semibold">{v.service}</span>
                {me?.isManager && (
                  <span className="text-muted-foreground">
                    {euro(Number(v.service_price) + Number(v.extra_price))}
                  </span>
                )}
                <span className="ml-auto rounded bg-secondary px-2 py-0.5 text-xs font-bold uppercase">
                  {STATUS_LABEL[v.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {v.station_number ? `Station #${v.station_number} ${v.station_name}` : "No station"}{" "}
                · {v.employee ? `by ${v.employee}` : "no employee recorded"}
                {v.delay_minutes > 0 && ` · delayed ${v.delay_minutes} min (${v.delay_reason})`}
              </p>
              {v.customer_note && (
                <p className="mt-2 rounded-lg bg-st-ready/10 px-3 py-2 text-sm">
                  <b>Customer note:</b> {v.customer_note}
                </p>
              )}
              {v.extras.length > 0 && (
                <ul className="mt-2 text-sm">
                  {v.extras.map((x, i) => (
                    <li key={i}>
                      + {x.title}{" "}
                      <span className="text-muted-foreground">
                        ({x.status}
                        {me?.isManager ? `, ${euro(x.price)}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {v.notes.length > 0 && (
                <ul className="mt-2 grid gap-1 text-sm">
                  {v.notes.map((n, i) => (
                    <li
                      key={i}
                      className={cn(
                        "rounded px-2 py-1",
                        n.kind === "issue" ? "bg-st-maintenance/10" : "bg-secondary/50",
                      )}
                    >
                      {n.kind === "issue" && <b className="text-st-maintenance">Issue: </b>}
                      {n.body}{" "}
                      <span className="text-xs text-muted-foreground">
                        — {n.by ?? "?"}, {fmtDateTime(n.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Workflow ({v.events.length} steps)
                </summary>
                <ol className="mt-2 grid gap-1">
                  {v.events.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="size-4 text-st-available" />
                      <span className="w-12 font-mono">{fmtTime(e.at)}</span>
                      <span>{STATUS_LABEL[e.step]}</span>
                      <span className="text-muted-foreground">{e.by ?? "system"}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs uppercase text-muted-foreground">{k}</div>
      <div className="mt-1 font-semibold">{v}</div>
    </div>
  );
}
