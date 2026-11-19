import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLive, useOps, type Ops } from "@/hooks/use-ops";
import { loadMe, useStaff } from "@/hooks/use-staff";
import { candidateStations, pickStation, type AStation } from "@/lib/assignment";
import {
  addDays,
  dayBounds,
  localDay,
  localMinutes,
  minToHHMM,
  toMin,
  zonedToUtc,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  euro,
  fmtLongDate,
  fmtTime,
  isDelayed,
  isLateArrival,
  STATUS_LABEL,
  type ApptStatus,
} from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/appointments")({
  validateSearch: z.object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    open: z.string().optional(),
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({ queryKey: ["me"], queryFn: loadMe });
    if (!me?.isManager) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Appointments — Genarts" },
      { name: "description", content: "Manage appointments." },
    ],
  }),
  component: Appointments,
});

type Appt = Ops["appointments"][number];

/** All appointments overlapping a local day (± neighbours so overlap checks are complete). */
function useDay(day: string) {
  useLive(["appointments", "station_unavailability"], [["day", day]]);
  return useQuery({
    queryKey: ["day", day],
    queryFn: async () => {
      const { from, to } = dayBounds(day);
      const [ap, un] = await Promise.all([
        supabase
          .from("appointments")
          .select("*")
          .lt("starts_at", to.toISOString())
          .gt("busy_until", from.toISOString())
          .order("starts_at"),
        supabase
          .from("station_unavailability")
          .select("*")
          .lt("starts_at", to.toISOString())
          .gt("ends_at", from.toISOString()),
      ]);
      if (ap.error || un.error) throw new Error((ap.error ?? un.error)!.message);
      return { appointments: ap.data, unavailability: un.data };
    },
  });
}

const FILTERS = [
  { k: "all", label: "All" },
  { k: "upcoming", label: "Upcoming" },
  { k: "onsite", label: "On site" },
  { k: "done", label: "Picked up" },
  { k: "cancelled", label: "Cancelled" },
] as const;

function Appointments() {
  const { day: dayParam, open } = Route.useSearch();
  const navigate = useNavigate({ from: "/appointments" });
  const today = localDay(new Date());
  const day = dayParam ?? today;
  const { data: ops } = useOps();
  const { data, isLoading } = useDay(day);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["k"]>("all");
  const [q, setQ] = useState("");
  const now = new Date();

  const list = useMemo(() => {
    const { from, to } = dayBounds(day);
    return (data?.appointments ?? []).filter((a) => {
      const t = new Date(a.starts_at);
      if (t < from || t >= to) return false;
      if (
        q &&
        !`${a.reg_number} ${a.customer_name} ${a.customer_phone} ${a.make} ${a.model}`
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;
      if (filter === "upcoming") return a.status === "confirmed";
      if (filter === "onsite")
        return [
          "arrived",
          "checked_in",
          "washing",
          "exterior_done",
          "interior_done",
          "quality_check",
          "ready",
        ].includes(a.status);
      if (filter === "done") return a.status === "picked_up";
      if (filter === "cancelled") return a.status === "cancelled";
      return true;
    });
  }, [data, day, filter, q]);

  const setOpen = (id?: string) => navigate({ search: (s) => ({ ...s, open: id }) });
  const go = (d: string) => navigate({ search: { day: d === today ? undefined : d } });
  const revenue = list
    .filter((a) => a.status !== "cancelled")
    .reduce(
      (s, a) =>
        s +
        Number(ops?.services.find((x) => x.id === a.service_id)?.price ?? 0) +
        Number(a.extra_price),
      0,
    );

  return (
    <div className="min-h-screen pb-12">
      <StaffNav />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl md:text-4xl">Appointments</h1>
          <Button variant="hero" onClick={() => setOpen("new")}>
            <Plus />
            New appointment
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(addDays(day, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={day}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="w-auto"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(addDays(day, 1))}
            aria-label="Next day"
          >
            <ChevronRight />
          </Button>
          {day !== today && (
            <Button variant="ghost" onClick={() => go(today)}>
              Today
            </Button>
          )}
          <span className="ml-2 font-semibold">{fmtLongDate(zonedToUtc(day, 720))}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                filter === f.k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Plate, name, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Time</th>
                <th>Plate</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Station</th>
                <th>Status</th>
                <th className="pr-3 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-4 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-muted-foreground">
                    No appointments.
                  </td>
                </tr>
              )}
              {list.map((a) => {
                const svc = ops?.services.find((s) => s.id === a.service_id);
                const st = ops?.stations.find((s) => s.id === a.station_id);
                return (
                  <tr
                    key={a.id}
                    onClick={() => setOpen(a.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/50 last:border-0 hover:bg-accent/40",
                      a.status === "cancelled" && "opacity-50",
                    )}
                  >
                    <td className="p-3 font-mono font-bold">
                      {fmtTime(a.starts_at)}
                      <span className="font-normal text-muted-foreground">
                        –{fmtTime(a.ends_at)}
                      </span>
                    </td>
                    <td>
                      <span className="plate text-xs">{a.reg_number}</span>
                    </td>
                    <td>
                      {a.customer_name}
                      <div className="text-xs text-muted-foreground">{a.customer_phone}</div>
                    </td>
                    <td>{svc?.name}</td>
                    <td>
                      {st ? (
                        `#${st.number} ${st.name}`
                      ) : (
                        <span className="text-destructive">none</span>
                      )}
                      {a.station_locked && (
                        <Wrench
                          className="ml-1 inline size-3 text-muted-foreground"
                          aria-label="set by hand"
                        />
                      )}
                    </td>
                    <td>
                      {STATUS_LABEL[a.status as ApptStatus]}
                      {isDelayed(a, now) && (
                        <span className="ml-1 text-xs font-bold text-destructive">delayed</span>
                      )}
                      {isLateArrival(a, now) && (
                        <span className="ml-1 text-xs font-bold text-st-washing">late</span>
                      )}
                    </td>
                    <td className="pr-3 text-right">
                      {euro(Number(svc?.price ?? 0) + Number(a.extra_price))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-right text-sm text-muted-foreground">
          {list.length} appointments · {euro(revenue)}
        </p>
      </main>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(undefined)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && ops && (
            <Editor
              key={open}
              ops={ops}
              day={day}
              appt={
                open === "new"
                  ? null
                  : (data?.appointments.find((a) => a.id === open) ??
                    ops.appointments.find((a) => a.id === open) ??
                    null)
              }
              missing={
                open !== "new" &&
                !data?.appointments.some((a) => a.id === open) &&
                !ops.appointments.some((a) => a.id === open)
              }
              onDone={(id) => setOpen(id)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function nextQuarter() {
  const m = localMinutes(new Date());
  return Math.ceil((m + 5) / 15) * 15;
}

function Editor({
  ops,
  appt,
  day,
  missing,
  onDone,
}: {
  ops: Ops;
  appt: Appt | null;
  day: string;
  missing: boolean;
  onDone: (id?: string) => void;
}) {
  const { data: me } = useStaff();
  const isNew = !appt;
  const [f, setF] = useState(() => ({
    customer_name: appt?.customer_name ?? "",
    customer_phone: appt?.customer_phone ?? "",
    customer_email: appt?.customer_email ?? "",
    reg_number: appt?.reg_number ?? "",
    make: appt?.make ?? "",
    model: appt?.model ?? "",
    customer_note: appt?.customer_note ?? "",
    service_id: appt?.service_id ?? ops.services.find((s) => s.active)?.id ?? "",
    day: appt ? localDay(new Date(appt.starts_at)) : day,
    time: appt
      ? minToHHMM(localMinutes(new Date(appt.starts_at)))
      : minToHHMM(Math.min(nextQuarter(), 23 * 60)),
    station_id: appt?.station_id ?? "auto",
    notify_customer: appt?.notify_customer ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const { data: sched } = useDay(f.day);

  const svc = ops.services.find((s) => s.id === f.service_id);
  const start = zonedToUtc(f.day, toMin(f.time || "00:00"));
  const end = new Date(start.getTime() + (svc?.duration_min ?? 30) * 60000);
  const stations: AStation[] = ops.stations.map((s) => ({
    ...s,
    serviceIds: ops.stationServices.filter((l) => l.station_id === s.id).map((l) => l.service_id),
  }));
  const schedArgs = {
    stations,
    serviceId: f.service_id,
    start,
    end,
    appointments: (sched?.appointments ?? []).filter((a) => a.status !== "cancelled"),
    unavailability: sched?.unavailability ?? [],
    ignoreId: appt?.id,
  };
  const free = new Set(candidateStations(schedArgs).map((s) => s.id));
  const auto = pickStation(schedArgs);

  if (missing)
    return <p className="p-4 text-muted-foreground">Appointment not found on this day.</p>;

  const save = async () => {
    if (!f.customer_name.trim() || !f.reg_number.trim() || !svc)
      return void toast.error("Name, plate and service are required");
    const stationId = f.station_id === "auto" ? auto?.id : f.station_id;
    if (!stationId) return void toast.error("No station is free at that time. Pick another time.");
    if (
      f.station_id !== "auto" &&
      !free.has(stationId) &&
      !confirm(
        "That station is busy or closed at this time. Save anyway? (The database still blocks double bookings.)",
      )
    )
      return;
    setBusy(true);
    const row = {
      customer_name: f.customer_name.trim(),
      customer_phone: f.customer_phone.trim(),
      customer_email: f.customer_email.trim(),
      reg_number: f.reg_number.trim(),
      make: f.make.trim(),
      model: f.model.trim(),
      customer_note: f.customer_note.trim(),
      service_id: f.service_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      station_id: stationId,
      station_locked:
        f.station_id === "auto"
          ? false
          : appt?.station_id === f.station_id
            ? appt.station_locked
            : true,
      notify_customer: f.notify_customer,
    };
    const res = isNew
      ? await supabase.from("appointments").insert(row).select("id").single()
      : await supabase.from("appointments").update(row).eq("id", appt.id).select("id").single();
    setBusy(false);
    if (res.error) {
      return void toast.error(
        res.error.code === "23P01"
          ? "That station already has a booking at this time."
          : res.error.message,
      );
    }
    toast.success(isNew ? "Appointment created" : "Saved");
    if (isNew) onDone(res.data.id);
  };

  const status = async (s: ApptStatus) => {
    const { error } = await supabase.from("appointments").update({ status: s }).eq("id", appt!.id);
    if (error) toast.error(error.message);
    else toast.success(STATUS_LABEL[s]);
  };
  const remove = async () => {
    if (!confirm("Delete this appointment permanently? Use Cancel to keep the history.")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", appt!.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      onDone(undefined);
    }
  };

  return (
    <div className="grid gap-4 pb-10">
      <SheetHeader>
        <SheetTitle className="text-2xl">
          {isNew ? "New appointment" : <span className="plate">{appt.reg_number}</span>}
        </SheetTitle>
        {!isNew && (
          <p className="text-sm text-muted-foreground">
            {STATUS_LABEL[appt.status as ApptStatus]} · {svc?.name} ·{" "}
            {euro(Number(svc?.price ?? 0) + Number(appt.extra_price))}
          </p>
        )}
      </SheetHeader>

      {!isNew && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/tablet/$id" params={{ id: appt.id }}>
              Open workflow
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/vehicles/$reg" params={{ reg: appt.reg_number }}>
              <History />
              History
            </Link>
          </Button>
          {appt.status === "confirmed" && (
            <Button size="sm" variant="outline" onClick={() => status("arrived")}>
              Mark arrived
            </Button>
          )}
          {appt.status !== "cancelled" && appt.status !== "picked_up" && (
            <Button size="sm" variant="outline" onClick={() => status("cancelled")}>
              Cancel
            </Button>
          )}
          {appt.status === "cancelled" && (
            <Button size="sm" variant="outline" onClick={() => status("confirmed")}>
              Restore
            </Button>
          )}
        </div>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <F label="Customer *">
          <Input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </F>
        <F label="Phone">
          <Input
            type="tel"
            value={f.customer_phone}
            onChange={(e) => set("customer_phone", e.target.value)}
          />
        </F>
        <F label="E-mail">
          <Input
            type="email"
            value={f.customer_email}
            onChange={(e) => set("customer_email", e.target.value)}
          />
        </F>
        <F label="Plate *">
          <Input
            className="plate uppercase"
            value={f.reg_number}
            onChange={(e) => set("reg_number", e.target.value)}
          />
        </F>
        <F label="Make">
          <Input value={f.make} onChange={(e) => set("make", e.target.value)} />
        </F>
        <F label="Model">
          <Input value={f.model} onChange={(e) => set("model", e.target.value)} />
        </F>
        <div className="sm:col-span-2">
          <F label="Customer note">
            <Textarea
              value={f.customer_note}
              onChange={(e) => set("customer_note", e.target.value)}
            />
          </F>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <F label="Service">
            <Select value={f.service_id} onValueChange={(v) => set("service_id", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.services
                  .filter((s) => s.active || s.id === f.service_id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.duration_min} min · {euro(s.price)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </F>
        </div>
        <F label="Date">
          <Input
            type="date"
            value={f.day}
            onChange={(e) => e.target.value && set("day", e.target.value)}
          />
        </F>
        <F label="Time">
          <Input
            type="time"
            step={300}
            value={f.time}
            onChange={(e) => set("time", e.target.value)}
          />
        </F>
        <div className="sm:col-span-2">
          <F label={`Station · ${fmtTime(start.toISOString())}–${fmtTime(end.toISOString())}`}>
            <Select value={f.station_id} onValueChange={(v) => set("station_id", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <Sparkles className="mr-1 inline size-3.5" />
                  Automatic{auto ? ` → #${auto.number}` : " — nothing free"}
                </SelectItem>
                {ops.stations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    #{s.number} {s.name} {free.has(s.id) ? "· free" : "· busy / closed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          {f.station_id !== "auto" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Set by hand — overrides automatic assignment.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={f.notify_customer} onCheckedChange={(v) => set("notify_customer", v)} />
          Send the customer status updates
        </label>
      </fieldset>

      <Button variant="hero" onClick={save} disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {isNew ? "Create appointment" : "Save changes"}
      </Button>

      {!isNew && <TrackingLink appt={appt} />}
      {!isNew && me?.isAdmin && (
        <Button variant="ghost" className="justify-self-start text-destructive" onClick={remove}>
          Delete permanently
        </Button>
      )}
    </div>
  );
}

function TrackingLink({ appt }: { appt: Appt }) {
  const url = appt.tracking_token ? `${location.origin}/track/${appt.tracking_token}` : null;
  const act = async (revoke: boolean) => {
    if (revoke && !confirm("Revoke the link? The customer's current link stops working.")) return;
    if (!revoke && url && !confirm("Make a new link? The old one stops working.")) return;
    const { error } = await supabase.rpc("set_tracking_link", {
      _appointment_id: appt.id,
      _revoke: revoke,
    });
    if (error) toast.error(error.message);
    else toast.success(revoke ? "Link revoked" : "New link created");
  };
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <Link2 className="size-4" />
        Customer tracking link
      </p>
      {url ? (
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <Button
            size="icon"
            variant="outline"
            aria-label="Copy"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              toast.success("Copied");
            }}
          >
            <Copy />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No active link.</p>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => act(false)}>
          <RefreshCw />
          {url ? "Regenerate" : "Create link"}
        </Button>
        {url && (
          <Button size="sm" variant="ghost" onClick={() => act(true)}>
            <Link2Off />
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
