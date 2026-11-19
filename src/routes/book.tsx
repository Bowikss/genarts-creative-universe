import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Loader2 } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createBooking, getAvailability, getServices } from "@/lib/public.functions";
import { addDays, localDay } from "@/lib/time";
import { BUSINESS_TZ, euro, fmtDate, fmtLongDate, fmtTime } from "@/lib/workflow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book a wash — Genarts" },
      {
        name: "description",
        content:
          "Pick a service and a time. We assign a free bay and send you a live tracking link.",
      },
      { property: "og:title", content: "Book a wash — Genarts" },
      {
        property: "og:description",
        content:
          "Pick a service and a time. We assign a free bay and send you a live tracking link.",
      },
    ],
  }),
  component: BookPage,
});

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return {
    wd: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: BUSINESS_TZ }).format(d),
    dm: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: BUSINESS_TZ,
    }).format(d),
  };
};

function BookPage() {
  const navigate = useNavigate();
  const today = localDay(new Date());
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const [serviceId, setServiceId] = useState<string>();
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [alts, setAlts] = useState<string[]>();
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    reg_number: "",
    make: "",
    model: "",
    customer_note: "",
    website: "",
  });
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const services = useQuery({ queryKey: ["pub-services"], queryFn: () => getServices() });
  const service = services.data?.find((s) => s.id === serviceId);
  const avail = useQuery({
    queryKey: ["pub-slots", serviceId, day],
    enabled: !!serviceId,
    queryFn: () => getAvailability({ data: { service_id: serviceId!, day } }),
    refetchInterval: 60000,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !slot) return;
    setBusy(true);
    setAlts(undefined);
    try {
      const r = await createBooking({ data: { ...form, service_id: serviceId, starts_at: slot } });
      if (r.ok) {
        navigate({ to: "/track/$token", params: { token: r.token }, search: { new: 1 } });
        return;
      }
      setAlts(r.alternatives);
      setSlot(undefined);
      avail.refetch();
      toast.error("That time was just taken.", {
        description: r.alternatives.length
          ? "Pick one of the closest free times below."
          : "Please choose another day.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // zod errors arrive as JSON
      try {
        const z = JSON.parse(msg) as { message: string }[];
        toast.error(z.map((x) => x.message).join(" · "));
      } catch {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const step = !serviceId ? 1 : !slot ? 2 : 3;

  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <h1 className="text-4xl md:text-5xl">Book a wash</h1>
        <ol className="mt-6 flex gap-2 text-sm">
          {["Service", "Time", "Your details"].map((l, i) => (
            <li
              key={l}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1",
                step > i + 1
                  ? "border-primary/40 text-primary"
                  : step === i + 1
                    ? "border-primary text-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              {step > i + 1 ? (
                <Check className="size-3.5" />
              ) : (
                <span className="font-mono">{i + 1}</span>
              )}
              {l}
            </li>
          ))}
        </ol>

        {/* 1 — service */}
        <section className="mt-8">
          <h2 className="text-xl">1. Choose a service</h2>
          {services.isLoading && (
            <p className="mt-4 text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin" /> Loading…
            </p>
          )}
          {services.error && (
            <p className="mt-4 text-destructive">Could not load services. Please refresh.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {services.data?.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  setSlot(undefined);
                  setAlts(undefined);
                }}
                className={cn(
                  "rounded-xl border-2 bg-card p-5 text-left transition-colors hover:border-primary",
                  serviceId === s.id ? "border-primary shadow-glow" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-lg font-semibold">{s.name}</span>
                  <span className="font-display text-xl text-primary">{euro(s.price)}</span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  {s.duration_min} min
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* 2 — time */}
        {serviceId && (
          <section className="mt-10">
            <h2 className="text-xl">2. Pick a time</h2>
            <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {days.map((d) => {
                const l = dayLabel(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDay(d);
                      setSlot(undefined);
                    }}
                    className={cn(
                      "min-w-16 shrink-0 rounded-lg border-2 px-3 py-2 text-center",
                      day === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary",
                    )}
                  >
                    <div className="text-xs uppercase">{d === today ? "Today" : l.wd}</div>
                    <div className="font-semibold">{l.dm}</div>
                  </button>
                );
              })}
            </div>
            {alts && alts.length > 0 && (
              <div className="mt-4 rounded-xl border border-st-washing/50 bg-st-washing/10 p-4">
                <p className="font-semibold">Closest free times</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alts.map((a) => (
                    <Button
                      key={a}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDay(localDay(new Date(a)));
                        setSlot(a);
                        setAlts(undefined);
                      }}
                    >
                      {fmtDate(a)} · {fmtTime(a)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4">
              {avail.isLoading && (
                <p className="text-muted-foreground">
                  <Loader2 className="inline size-4 animate-spin" /> Finding free times…
                </p>
              )}
              {avail.data && avail.data.slots.length === 0 && (
                <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
                  No free times on this day for {service?.name}. Try another day.
                </p>
              )}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {avail.data?.slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={cn(
                      "rounded-md border-2 py-2 font-mono text-sm font-bold",
                      slot === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary",
                    )}
                  >
                    {fmtTime(s)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 3 — details */}
        {serviceId && slot && (
          <section className="mt-10">
            <h2 className="text-xl">3. Your details</h2>
            <p className="mt-2 text-muted-foreground">
              {service?.name} · {fmtLongDate(slot)} at{" "}
              <b className="text-foreground">{fmtTime(slot)}</b> · {euro(service?.price)}
            </p>
            <form
              onSubmit={submit}
              className="mt-4 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 sm:p-6"
            >
              <Field id="name" label="Full name *">
                <Input
                  id="name"
                  required
                  autoComplete="name"
                  value={form.customer_name}
                  onChange={set("customer_name")}
                />
              </Field>
              <Field id="phone" label="Phone *">
                <Input
                  id="phone"
                  required
                  type="tel"
                  autoComplete="tel"
                  placeholder="+371 2…"
                  value={form.customer_phone}
                  onChange={set("customer_phone")}
                />
              </Field>
              <Field id="email" label="E-mail">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.customer_email}
                  onChange={set("customer_email")}
                />
              </Field>
              <Field id="reg" label="Registration number *">
                <Input
                  id="reg"
                  required
                  className="plate uppercase"
                  placeholder="AB1234"
                  value={form.reg_number}
                  onChange={set("reg_number")}
                />
              </Field>
              <Field id="make" label="Make">
                <Input
                  id="make"
                  placeholder="Volkswagen"
                  value={form.make}
                  onChange={set("make")}
                />
              </Field>
              <Field id="model" label="Model">
                <Input id="model" placeholder="Golf" value={form.model} onChange={set("model")} />
              </Field>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="note">Anything we should know?</Label>
                <Textarea
                  id="note"
                  maxLength={500}
                  placeholder="Child seat in the back, scratch on the left door…"
                  value={form.customer_note}
                  onChange={set("customer_note")}
                />
              </div>
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="hidden"
                value={form.website}
                onChange={set("website")}
                name="website"
              />
              <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setSlot(undefined)}>
                  <ArrowLeft />
                  Change time
                </Button>
                <Button type="submit" variant="hero" size="lg" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}Confirm booking
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              You'll get a private link to follow your car live. We only use your contact details
              for this booking.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
