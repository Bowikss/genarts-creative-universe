import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Clock,
  Loader2,
  MessageSquarePlus,
  PlusCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { euro, fmtDateTime } from "@/lib/workflow";
import type { ApptDetail } from "@/hooks/use-appointment";

type Names = (id?: string | null) => string;
const fail = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)));

export function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const NOTE_KINDS = [
  { kind: "note", label: "Internal note" },
  { kind: "issue", label: "Vehicle issue" },
] as const;

export function NotesPanel({
  id,
  me,
  d,
  names,
}: {
  id: string;
  me: string;
  d: ApptDetail;
  names: Names;
}) {
  const [kind, setKind] = useState<"note" | "issue">("note");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("appointment_notes")
      .insert({ appointment_id: id, kind, body: body.trim(), author: me });
    setBusy(false);
    if (error) return void fail(error);
    setBody("");
  };
  return (
    <Section title="Notes & issues" icon={<MessageSquarePlus className="size-5" />}>
      <div className="flex gap-2">
        {NOTE_KINDS.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k.kind)}
            className={cn(
              "rounded-full border-2 px-3 py-1.5 text-sm font-semibold",
              kind === k.kind
                ? k.kind === "issue"
                  ? "border-st-maintenance bg-st-maintenance text-white"
                  : "border-primary bg-primary text-primary-foreground"
                : "border-border",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <Textarea
        className="mt-2 min-h-20 text-base"
        placeholder={
          kind === "issue"
            ? "e.g. Scratch on rear bumper, cracked mirror…"
            : "Internal note — customers never see this"
        }
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button className="mt-2 h-11 w-full sm:w-auto" onClick={add} disabled={busy || !body.trim()}>
        {busy && <Loader2 className="animate-spin" />}Save {kind === "issue" ? "issue" : "note"}
      </Button>
      <ul className="mt-4 grid gap-2">
        {d.notes.map((n) => (
          <li
            key={n.id}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              n.kind === "issue"
                ? "border-st-maintenance/60 bg-st-maintenance/10"
                : "border-border",
            )}
          >
            {n.kind === "issue" && (
              <span className="mr-1 font-bold text-st-maintenance">Issue:</span>
            )}
            {n.body}
            <div className="mt-1 text-xs text-muted-foreground">
              {names(n.author)} · {fmtDateTime(n.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function PhotosPanel({ id, me, d }: { id: string; me: string; d: ApptDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [view, setView] = useState<string>();
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(files.length);
    for (const f of Array.from(files)) {
      try {
        const blob = await compressImage(f);
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage
          .from("vehicle-photos")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const { error } = await supabase
          .from("appointment_photos")
          .insert({ appointment_id: id, path, author: me });
        if (error) throw error;
      } catch (e) {
        fail(e);
      }
      setBusy((b) => b - 1);
    }
    if (input.current) input.current.value = "";
  };
  return (
    <Section
      title="Photos"
      icon={<Camera className="size-5" />}
      action={
        <Button onClick={() => input.current?.click()} disabled={busy > 0} className="h-11">
          {busy > 0 ? <Loader2 className="animate-spin" /> : <Camera />}
          {busy > 0 ? `Uploading ${busy}…` : "Take photo"}
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      {d.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {d.photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setView(p.url)}
              className="aspect-square overflow-hidden rounded-lg bg-secondary"
            >
              {p.url && (
                <img src={p.url} alt="Vehicle" loading="lazy" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
      {view && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
          onClick={() => setView(undefined)}
        >
          <img src={view} alt="Vehicle" className="max-h-full max-w-full rounded-lg" />
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4"
            aria-label="Close"
          >
            <X />
          </Button>
        </div>
      )}
    </Section>
  );
}

const EXTRA_PRESETS = [
  "Additional interior cleaning",
  "Pet hair removal",
  "Extra detailing",
  "Additional treatment",
  "Engine bay cleaning",
  "Stain removal",
];

export function ExtraWorkPanel({
  id,
  me,
  d,
  names,
  canDecide,
}: {
  id: string;
  me: string;
  d: ApptDetail;
  names: Names;
  canDecide: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", details: "", price: "", minutes: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim()) return void toast.error("What extra work is needed?");
    setBusy(true);
    const { error } = await supabase.from("extra_work").insert({
      appointment_id: id,
      title: f.title.trim(),
      details: f.details.trim(),
      price: Number(f.price.replace(",", ".")) || 0,
      minutes: parseInt(f.minutes) || 0,
      requested_by: me,
    });
    setBusy(false);
    if (error) return void fail(error);
    toast.success("Sent to the manager for approval");
    setF({ title: "", details: "", price: "", minutes: "" });
    setOpen(false);
  };
  return (
    <Section
      title="Extra work"
      icon={<PlusCircle className="size-5" />}
      action={
        !open && (
          <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
            Request extra work
          </Button>
        )
      }
    >
      {open && (
        <div className="mb-4 grid gap-3 rounded-xl border border-primary/40 p-3">
          <div className="flex flex-wrap gap-2">
            {EXTRA_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setF({ ...f, title: p })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  f.title === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <Input
            className="h-11 text-base"
            placeholder="What is needed?"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
          <Textarea
            placeholder="Why? (optional)"
            value={f.details}
            onChange={(e) => setF({ ...f, details: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Price €</Label>
              <Input
                className="h-11"
                inputMode="decimal"
                value={f.price}
                onChange={(e) => setF({ ...f, price: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Extra minutes</Label>
              <Input
                className="h-11"
                inputMode="numeric"
                value={f.minutes}
                onChange={(e) => setF({ ...f, minutes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="h-11 flex-1" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Send to manager
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {d.extras.length === 0 && !open && (
        <p className="text-sm text-muted-foreground">No extra work requested.</p>
      )}
      <ul className="grid gap-2">
        {d.extras.map((x) => (
          <ExtraRow key={x.id} x={x} names={names} canDecide={canDecide} />
        ))}
      </ul>
    </Section>
  );
}

export function ExtraRow({
  x,
  names,
  canDecide,
  compact,
}: {
  x: ApptDetail["extras"][number];
  names: Names;
  canDecide: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const decide = async (status: "approved" | "rejected") => {
    setBusy(true);
    const { error } = await supabase.from("extra_work").update({ status }).eq("id", x.id);
    setBusy(false);
    if (error) fail(error);
    else toast.success(status === "approved" ? "Approved — customer updated" : "Rejected");
  };
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        x.status === "pending" ? "border-st-quality/60 bg-st-quality/10" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{x.title}</span>
        <span className="text-muted-foreground">
          {euro(x.price)} · +{x.minutes} min
        </span>
        <span
          className={cn(
            "ml-auto rounded px-2 py-0.5 text-xs font-bold uppercase",
            x.status === "approved"
              ? "bg-st-available text-black"
              : x.status === "rejected"
                ? "bg-secondary"
                : "bg-st-quality text-white",
          )}
        >
          {x.status}
        </span>
      </div>
      {x.details && !compact && <p className="mt-1 text-muted-foreground">{x.details}</p>}
      <div className="mt-1 text-xs text-muted-foreground">
        Requested by {names(x.requested_by)} · {fmtDateTime(x.created_at)}
        {x.decided_at && ` · ${x.status} by ${names(x.decided_by)}`}
      </div>
      {canDecide && x.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => decide("approved")} disabled={busy}>
            <Check />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("rejected")} disabled={busy}>
            <X />
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}

const DELAY_MIN = [10, 15, 20, 30, 45, 60];
const DELAY_REASONS = [
  "Heavier soiling than expected",
  "Extra work approved",
  "Equipment problem",
  "Waiting for previous car",
  "Staff shortage",
];

export function DelayPanel({
  id,
  me,
  d,
  names,
}: {
  id: string;
  me: string;
  d: ApptDetail;
  names: Names;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return void toast.error("Please give a reason");
    setBusy(true);
    const { error } = await supabase
      .from("appointment_delays")
      .insert({ appointment_id: id, minutes, reason: reason.trim(), reported_by: me });
    setBusy(false);
    if (error) return void fail(error);
    toast.success(`Delay reported — customer notified`);
    setOpen(false);
    setReason("");
  };
  return (
    <Section
      title="Delay"
      icon={<Clock className="size-5" />}
      action={
        !open && (
          <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
            <TriangleAlert />
            Report delay
          </Button>
        )
      }
    >
      {open && (
        <div className="mb-4 grid gap-3 rounded-xl border border-st-washing/60 p-3">
          <div className="flex flex-wrap gap-2">
            {DELAY_MIN.map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className={cn(
                  "min-w-16 rounded-lg border-2 px-3 py-2 font-mono font-bold",
                  minutes === m ? "border-st-washing bg-st-washing text-black" : "border-border",
                )}
              >
                +{m}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {DELAY_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  reason === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Input
            className="h-11 text-base"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button className="h-11 flex-1" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Report +{minutes} min
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {d.delays.length === 0 && !open && (
        <p className="text-sm text-muted-foreground">No delays.</p>
      )}
      <ul className="grid gap-2">
        {d.delays.map((x) => (
          <li key={x.id} className="rounded-lg border border-st-washing/50 px-3 py-2 text-sm">
            <b>+{x.minutes} min</b> · {x.reason}
            <div className="text-xs text-muted-foreground">
              {names(x.reported_by)} · {fmtDateTime(x.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
