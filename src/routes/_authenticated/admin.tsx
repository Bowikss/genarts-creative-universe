import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLive, useOps, type Ops } from "@/hooks/use-ops";
import { loadMe, useStaff } from "@/hooks/use-staff";
import { addDays, localDay, localMinutes, minToHHMM, toMin, zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  EMPLOYEE_STEPS,
  euro,
  fmtDateTime,
  ROLE_LABEL,
  type ApptStatus,
  type Role,
} from "@/lib/workflow";

const TABS = [
  { k: "maintenance", label: "Maintenance", admin: false },
  { k: "crew", label: "Station staff", admin: false },
  { k: "stations", label: "Stations", admin: true },
  { k: "services", label: "Services", admin: true },
  { k: "staff", label: "Staff accounts", admin: true },
  { k: "settings", label: "Settings", admin: true },
  { k: "reports", label: "Reports", admin: true },
] as const;
type Tab = (typeof TABS)[number]["k"];

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: z.object({
    tab: z
      .enum(["maintenance", "crew", "stations", "services", "staff", "settings", "reports"])
      .optional(),
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({ queryKey: ["me"], queryFn: loadMe });
    if (!me?.isManager) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [{ title: "Manage — Genarts" }, { name: "description", content: "Manage Genarts." }],
  }),
  component: Admin,
});

const fail = (e: { message: string } | null | undefined) => {
  if (e) {
    toast.error(e.message);
    return true;
  }
  return false;
};

function Admin() {
  const { data: me } = useStaff();
  const { data: ops } = useOps();
  const navigate = useNavigate({ from: "/admin" });
  const tabs = TABS.filter((t) => !t.admin || me?.isAdmin);
  const tab: Tab = Route.useSearch().tab ?? (me?.isAdmin ? "stations" : "maintenance");
  return (
    <div className="min-h-screen pb-16">
      <StaffNav />
      <main className="mx-auto max-w-5xl px-4 py-4">
        <h1 className="text-3xl md:text-4xl">Manage</h1>
        <div className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-border px-4">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => navigate({ search: { tab: t.k } })}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
                tab === t.k
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-5">
          {!ops ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              {tab === "maintenance" && <Maintenance ops={ops} />}
              {tab === "crew" && <Crew ops={ops} />}
              {me?.isAdmin && tab === "stations" && <Stations ops={ops} />}
              {me?.isAdmin && tab === "services" && <Services ops={ops} />}
              {me?.isAdmin && tab === "staff" && <Staff myId={me.user.id} />}
              {me?.isAdmin && tab === "settings" && <Settings />}
              {me?.isAdmin && tab === "reports" && <Reports ops={ops} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>{children}</div>
);
const F = ({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("grid gap-1.5", className)}>
    <Label>{label}</Label>
    {children}
  </div>
);

// ───────── Maintenance (managers) ─────────
function localInput(d: Date) {
  return `${localDay(d)}T${minToHHMM(localMinutes(d))}`;
}
function fromLocalInput(v: string) {
  const [day, t] = v.split("T");
  return zonedToUtc(day!, toMin(t ?? "00:00"));
}

function Maintenance({ ops }: { ops: Ops }) {
  const isAdmin = useStaffAdmin();
  const now = new Date();
  const [f, setF] = useState({
    station_id: ops.stations[0]?.id ?? "",
    from: localInput(now),
    to: localInput(new Date(now.getTime() + 2 * 3600000)),
    reason: "Maintenance",
  });
  const add = async () => {
    const from = fromLocalInput(f.from),
      to = fromLocalInput(f.to);
    if (!(to > from)) return void toast.error("End must be after start");
    const { error } = await supabase.from("station_unavailability").insert({
      station_id: f.station_id,
      starts_at: from.toISOString(),
      ends_at: to.toISOString(),
      reason: f.reason || "Maintenance",
    });
    if (!fail(error)) toast.success("Added — staff notified");
  };
  const del = async (id: string) =>
    fail((await supabase.from("station_unavailability").delete().eq("id", id)).error);
  const toggleOOS = async (id: string, v: boolean) =>
    fail((await supabase.from("stations").update({ out_of_service: v }).eq("id", id)).error);
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="mb-3 text-lg">Plan a maintenance window</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <F label="Station">
            <Select value={f.station_id} onValueChange={(v) => setF({ ...f, station_id: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.stations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    #{s.number} {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="From">
            <Input
              type="datetime-local"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
            />
          </F>
          <F label="To">
            <Input
              type="datetime-local"
              value={f.to}
              onChange={(e) => setF({ ...f, to: e.target.value })}
            />
          </F>
          <F label="Reason">
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </F>
        </div>
        <Button className="mt-3" onClick={add}>
          <Plus />
          Add
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          New bookings skip the station during this window. Existing bookings are flagged on the
          Today page so you can move them.
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg">Current & upcoming</h2>
        {ops.unavailability.length === 0 && (
          <p className="text-sm text-muted-foreground">None planned.</p>
        )}
        <ul className="grid gap-2">
          {ops.unavailability.map((u) => {
            const s = ops.stations.find((x) => x.id === u.station_id);
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <b>
                  #{s?.number} {s?.name}
                </b>
                <span>
                  {fmtDateTime(u.starts_at)} → {fmtDateTime(u.ends_at)}
                </span>
                <span className="text-muted-foreground">{u.reason}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => del(u.id)}
                  aria-label="Remove"
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg">Out of service (until switched back)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ops.stations.map((s) => (
            <label
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span>
                #{s.number} {s.name}
              </span>
              <Switch
                checked={s.out_of_service}
                onCheckedChange={(v) => toggleOOS(s.id, v)}
                disabled={!isAdmin}
              />
            </label>
          ))}
        </div>
        {!isAdmin && (
          <p className="mt-2 text-xs text-muted-foreground">
            Only an admin can switch a station fully out of service. Use a maintenance window
            instead.
          </p>
        )}
      </Card>
    </div>
  );
}
function useStaffAdmin() {
  return !!useStaff().data?.isAdmin;
}

// ───────── Station staff (managers) ─────────
function useStaffList() {
  useLive(["user_roles", "profiles"], [["staff-list"]]);
  return useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("*"),
      ]);
      if (p.error || r.error) throw new Error((p.error ?? r.error)!.message);
      return p.data.map((x) => ({
        ...x,
        roles: r.data.filter((y) => y.user_id === x.id).map((y) => y.role as Role),
      }));
    },
  });
}

function Crew({ ops }: { ops: Ops }) {
  const { data: people } = useStaffList();
  const staff = (people ?? []).filter((p) => p.roles.length > 0);
  const has = (st: string, u: string) =>
    ops.stationEmployees.some((x) => x.station_id === st && x.user_id === u);
  const toggle = async (st: string, u: string, on: boolean) => {
    const r = on
      ? await supabase.from("station_employees").insert({ station_id: st, user_id: u })
      : await supabase.from("station_employees").delete().eq("station_id", st).eq("user_id", u);
    fail(r.error);
  };
  return (
    <Card className="overflow-x-auto">
      <p className="mb-3 text-sm text-muted-foreground">
        Employees only see cars on the stations ticked here. Managers and admins see all stations.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-2 pr-3">Person</th>
            {ops.stations.map((s) => (
              <th key={s.id} className="px-2 text-center">
                #{s.number}
                <div className="text-xs font-normal text-muted-foreground">{s.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="py-2 pr-3">
                {p.full_name}
                <div className="text-xs text-muted-foreground">
                  {p.roles.map((r) => ROLE_LABEL[r]).join(", ")}
                </div>
              </td>
              {ops.stations.map((s) => (
                <td key={s.id} className="px-2 text-center">
                  <Checkbox
                    className="size-6"
                    checked={has(s.id, p.id)}
                    onCheckedChange={(v) => toggle(s.id, p.id, !!v)}
                    aria-label={`${p.full_name} on #${s.number}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ───────── Stations (admin) ─────────
function Stations({ ops }: { ops: Ops }) {
  const add = async () => {
    const n = Math.max(0, ...ops.stations.map((s) => s.number)) + 1;
    const { data, error } = await supabase
      .from("stations")
      .insert({ number: n, name: `Bay ${n}` })
      .select("id")
      .single();
    if (fail(error) || !data) return;
    await supabase
      .from("station_services")
      .insert(
        ops.services
          .filter((s) => s.active)
          .map((s) => ({ station_id: data.id, service_id: s.id })),
      );
  };
  return (
    <div className="grid gap-4">
      {ops.stations.map((s) => (
        <StationEditor key={s.id} s={s} ops={ops} />
      ))}
      <Button variant="outline" className="justify-self-start" onClick={add}>
        <Plus />
        Add station
      </Button>
    </div>
  );
}

function StationEditor({ s, ops }: { s: Ops["stations"][number]; ops: Ops }) {
  const [f, setF] = useState({
    number: String(s.number),
    name: s.name,
    open: s.open_time.slice(0, 5),
    close: s.close_time.slice(0, 5),
  });
  const dirty =
    f.number !== String(s.number) ||
    f.name !== s.name ||
    f.open !== s.open_time.slice(0, 5) ||
    f.close !== s.close_time.slice(0, 5);
  const save = async () => {
    if (toMin(f.close) <= toMin(f.open))
      return void toast.error("Closing time must be after opening time");
    const { error } = await supabase
      .from("stations")
      .update({
        number: parseInt(f.number),
        name: f.name.trim(),
        open_time: f.open,
        close_time: f.close,
      })
      .eq("id", s.id);
    if (!fail(error)) toast.success("Saved");
  };
  const supports = (sv: string) =>
    ops.stationServices.some((x) => x.station_id === s.id && x.service_id === sv);
  const toggle = async (sv: string, on: boolean) =>
    fail(
      (on
        ? await supabase.from("station_services").insert({ station_id: s.id, service_id: sv })
        : await supabase
            .from("station_services")
            .delete()
            .eq("station_id", s.id)
            .eq("service_id", sv)
      ).error,
    );
  const del = async () => {
    if (
      !confirm(
        `Delete station #${s.number}? Bookings on it keep their history but lose the station.`,
      )
    )
      return;
    fail((await supabase.from("stations").delete().eq("id", s.id)).error);
  };
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-[80px_1fr_120px_120px_auto]">
        <F label="No.">
          <Input
            inputMode="numeric"
            value={f.number}
            onChange={(e) => setF({ ...f, number: e.target.value })}
          />
        </F>
        <F label="Name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </F>
        <F label="Opens">
          <Input
            type="time"
            value={f.open}
            onChange={(e) => setF({ ...f, open: e.target.value })}
          />
        </F>
        <F label="Closes">
          <Input
            type="time"
            value={f.close}
            onChange={(e) => setF({ ...f, close: e.target.value })}
          />
        </F>
        <div className="flex items-end gap-1">
          <Button onClick={save} disabled={!dirty}>
            Save
          </Button>
          <Button variant="ghost" size="icon" onClick={del} aria-label="Delete station">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <span className="text-sm text-muted-foreground">Services:</span>
        {ops.services.map((sv) => (
          <label
            key={sv.id}
            className={cn("flex items-center gap-2 text-sm", !sv.active && "opacity-50")}
          >
            <Checkbox checked={supports(sv.id)} onCheckedChange={(v) => toggle(sv.id, !!v)} />
            {sv.name}
          </label>
        ))}
      </div>
    </Card>
  );
}

// ───────── Services (admin) ─────────
function Services({ ops }: { ops: Ops }) {
  const add = async () =>
    fail(
      (
        await supabase
          .from("services")
          .insert({ name: "New service", duration_min: 30, price: 0, active: false })
      ).error,
    );
  return (
    <div className="grid gap-3">
      {ops.services.map((s) => (
        <ServiceEditor key={s.id} s={s} />
      ))}
      <Button variant="outline" className="justify-self-start" onClick={add}>
        <Plus />
        Add service
      </Button>
      <p className="text-xs text-muted-foreground">
        Inactive services can't be booked online. Remember to tick new services on the stations that
        can do them.
      </p>
    </div>
  );
}
function ServiceEditor({ s }: { s: Ops["services"][number] }) {
  const [f, setF] = useState({
    name: s.name,
    duration: String(s.duration_min),
    price: String(s.price),
  });
  const dirty =
    f.name !== s.name || f.duration !== String(s.duration_min) || f.price !== String(s.price);
  const save = async () => {
    const d = parseInt(f.duration),
      p = Number(f.price.replace(",", "."));
    if (!(d >= 5 && d <= 600) || !(p >= 0))
      return void toast.error("Check duration (5–600 min) and price");
    if (
      !fail(
        (
          await supabase
            .from("services")
            .update({ name: f.name.trim(), duration_min: d, price: p })
            .eq("id", s.id)
        ).error,
      )
    )
      toast.success("Saved");
  };
  return (
    <Card className="grid items-end gap-3 sm:grid-cols-[1fr_110px_110px_auto_auto]">
      <F label="Service">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </F>
      <F label="Minutes">
        <Input
          inputMode="numeric"
          value={f.duration}
          onChange={(e) => setF({ ...f, duration: e.target.value })}
        />
      </F>
      <F label="Price €">
        <Input
          inputMode="decimal"
          value={f.price}
          onChange={(e) => setF({ ...f, price: e.target.value })}
        />
      </F>
      <label className="flex h-9 items-center gap-2 text-sm">
        <Switch
          checked={s.active}
          onCheckedChange={async (v) =>
            fail((await supabase.from("services").update({ active: v }).eq("id", s.id)).error)
          }
        />
        Bookable
      </label>
      <Button onClick={save} disabled={!dirty}>
        Save
      </Button>
    </Card>
  );
}

// ───────── Staff accounts (admin) ─────────
function Staff({ myId }: { myId: string }) {
  const { data: people, isLoading } = useStaffList();
  const qc = useQueryClient();
  const setRole = async (uid: string, role: Role | "none") => {
    if (uid === myId && role !== "admin")
      return void toast.error("You can't remove your own admin access.");
    const del = await supabase.from("user_roles").delete().eq("user_id", uid);
    if (fail(del.error)) return;
    if (
      role !== "none" &&
      fail((await supabase.from("user_roles").insert({ user_id: uid, role })).error)
    )
      return;
    toast.success("Access updated");
    qc.invalidateQueries({ queryKey: ["staff-list"] });
  };
  const sorted = [...(people ?? [])].sort(
    (a, b) => (a.roles.length ? 1 : 0) - (b.roles.length ? 1 : 0),
  );
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        New people sign up at <b>/auth</b>, then wait here until you give them a role. Employees see
        only their stations; managers run the day; admins also manage stations, services, staff and
        settings.
      </p>
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {sorted.map((p) => {
        const role: Role | "none" = p.roles.includes("admin")
          ? "admin"
          : p.roles.includes("manager")
            ? "manager"
            : p.roles.includes("employee")
              ? "employee"
              : "none";
        return (
          <Card
            key={p.id}
            className={cn(
              "flex flex-wrap items-center gap-3",
              role === "none" && "border-st-ready/60",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {p.full_name || "(no name)"}
                {p.id === myId && <span className="ml-2 text-xs text-muted-foreground">you</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                Joined {fmtDateTime(p.created_at)}
                {role === "none" && <b className="ml-2 text-st-ready">waiting for approval</b>}
              </div>
            </div>
            <Select value={role} onValueChange={(v) => setRole(p.id, v as Role | "none")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No access</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Card>
        );
      })}
    </div>
  );
}

// ───────── Settings (admin) ─────────
function Settings() {
  useLive(["settings"], [["settings"]]);
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const [name, setName] = useState<string>();
  if (!q.data) return <p className="text-muted-foreground">{q.error?.message ?? "Loading…"}</p>;
  const s = q.data;
  const steps = new Set(s.notify_steps);
  const toggleStep = async (st: ApptStatus, on: boolean) => {
    const next = ["confirmed" as ApptStatus, ...EMPLOYEE_STEPS.map((x) => x.status)].filter((x) =>
      x === st ? on : steps.has(x),
    );
    if (
      !fail(
        (
          await supabase
            .from("settings")
            .update({ notify_steps: next, updated_at: new Date().toISOString() })
            .eq("id", 1)
        ).error,
      )
    )
      q.refetch();
  };
  const url = `${typeof location !== "undefined" ? location.origin : ""}/display/${s.display_key}`;
  const rotate = async () => {
    if (!confirm("Make a new TV link? Screens using the old link stop updating.")) return;
    if (!fail((await supabase.rpc("rotate_display_key")).error)) {
      toast.success("New link created");
      q.refetch();
    }
  };
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="text-lg">Business name</h2>
        <div className="mt-2 flex gap-2">
          <Input
            value={name ?? s.business_name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
          <Button
            disabled={name === undefined || name === s.business_name}
            onClick={async () => {
              if (
                !fail(
                  (
                    await supabase
                      .from("settings")
                      .update({ business_name: name!.trim() })
                      .eq("id", 1)
                  ).error,
                )
              ) {
                toast.success("Saved");
                q.refetch();
              }
            }}
          >
            Save
          </Button>
        </div>
      </Card>
      <Card>
        <h2 className="text-lg">Customer notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which steps send the customer an update (shown on their tracking page, ready for
          SMS/e-mail). Delays and approved extra work always notify.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { status: "confirmed" as ApptStatus, label: "Appointment booked" },
            ...EMPLOYEE_STEPS,
          ].map((x) => (
            <label key={x.status} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={steps.has(x.status)}
                onCheckedChange={(v) => toggleStep(x.status, !!v)}
              />
              {x.label}
            </label>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg">Lobby TV link</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open on the waiting-room TV — no login needed. Shows stations and masked plates only (no
          names). Anyone with the link can view it.
        </p>
        <div className="mt-2 flex gap-2">
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
        <Button variant="outline" size="sm" className="mt-2" onClick={rotate}>
          <RefreshCw />
          New link
        </Button>
      </Card>
    </div>
  );
}

// ───────── Reports (admin) ─────────
function Reports({ ops }: { ops: Ops }) {
  const [days, setDays] = useState(7);
  const today = localDay(new Date());
  const from = zonedToUtc(addDays(today, -(days - 1)), 0);
  const q = useQuery({
    queryKey: ["report", days, today],
    queryFn: async () => {
      const [ap, dl] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id,service_id,status,starts_at,started_at,completed_at,extra_price,assigned_employee,delay_minutes",
          )
          .gte("starts_at", from.toISOString())
          .lt("starts_at", new Date().toISOString()),
        supabase
          .from("appointment_delays")
          .select("id,minutes")
          .gte("created_at", from.toISOString()),
      ]);
      if (ap.error || dl.error) throw new Error((ap.error ?? dl.error)!.message);
      return { appts: ap.data, delays: dl.data };
    },
  });
  if (!q.data) return <p className="text-muted-foreground">{q.error?.message ?? "Loading…"}</p>;
  const price = (a: { service_id: string; extra_price: number }) =>
    Number(ops.services.find((s) => s.id === a.service_id)?.price ?? 0) + Number(a.extra_price);
  const done = q.data.appts.filter((a) => a.status === "picked_up");
  const noShow = q.data.appts.filter((a) => a.status === "cancelled").length;
  const revenue = done.reduce((s, a) => s + price(a), 0);
  const extras = done.reduce((s, a) => s + Number(a.extra_price), 0);
  const durs = done
    .filter((a) => a.started_at && a.completed_at)
    .map((a) => (new Date(a.completed_at!).getTime() - new Date(a.started_at!).getTime()) / 60000);
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const group = <K extends string>(key: (a: (typeof done)[number]) => K) => {
    const m = new Map<K, { n: number; sum: number }>();
    for (const a of done) {
      const k = key(a);
      const v = m.get(k) ?? { n: 0, sum: 0 };
      v.n++;
      v.sum += price(a);
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum);
  };
  const byDay = group((a) => localDay(new Date(a.starts_at))).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );
  const byService = group((a) => a.service_id);
  const byEmp = group((a) => a.assigned_employee ?? "—");
  const name = (id: string) => ops.profiles.find((p) => p.id === id)?.full_name ?? "—";
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {[1, 7, 30, 90].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? "default" : "outline"}
            onClick={() => setDays(d)}
          >
            {d === 1 ? "Today" : `${d} days`}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Revenue", euro(revenue)],
          ["of which extras", euro(extras)],
          ["Cars done", String(done.length)],
          ["Avg. wash", `${avg} min`],
          ["Delays", String(q.data.delays.length)],
          ["Cancelled / no-show", String(noShow)],
        ].map(([k, v]) => (
          <Card key={k}>
            <div className="text-xs uppercase text-muted-foreground">{k}</div>
            <div className="mt-1 font-display text-2xl">{v}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Table title="By day" rows={byDay.map(([k, v]) => [k, v.n, v.sum])} />
        <Table
          title="By service"
          rows={byService.map(([k, v]) => [
            ops.services.find((s) => s.id === k)?.name ?? "—",
            v.n,
            v.sum,
          ])}
        />
        <Table title="By employee" rows={byEmp.map(([k, v]) => [name(k), v.n, v.sum])} />
      </div>
    </div>
  );
}
function Table({ title, rows }: { title: string; rows: [string, number, number][] }) {
  return (
    <Card>
      <h3 className="mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed cars.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-1"></th>
              <th className="text-right">Cars</th>
              <th className="text-right">€</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, n, s]) => (
              <tr key={k} className="border-t border-border/50">
                <td className="py-1.5">{k}</td>
                <td className="text-right">{n}</td>
                <td className="text-right">{euro(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
