import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { BellRing, Check, Copy, MapPin, PartyPopper } from "lucide-react";
import { z } from "zod";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { getTracking } from "@/lib/public.functions";
import {
  CUSTOMER_STEPS,
  customerProgress,
  euro,
  fmtDate,
  fmtTime,
  STATUS_LABEL,
  type ApptStatus,
} from "@/lib/workflow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/track/$token")({
  validateSearch: z.object({ new: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "Your car — Genarts" },
      { name: "description", content: "Live status of your car wash." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: TrackPage,
});

const POLL_MS = 8000;

function TrackPage() {
  const { token } = Route.useParams();
  const { new: isNew } = Route.useSearch();
  const q = useQuery({
    queryKey: ["track", token],
    queryFn: () => getTracking({ data: { token } }),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "picked_up" || s === "cancelled" ? false : POLL_MS;
    },
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const a = q.data;

  // Optional browser notification when the car is ready (while this page is open).
  const [notifyOn, setNotifyOn] = useState(false);
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!a) return;
    if (
      prev.current &&
      prev.current !== a.status &&
      notifyOn &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(
        a.status === "ready"
          ? "Your car is ready for pickup!"
          : STATUS_LABEL[a.status as ApptStatus],
        { body: a.reg_number },
      );
    }
    prev.current = a.status;
  }, [a, notifyOn]);

  if (q.isLoading)
    return (
      <Shell>
        <p className="text-muted-foreground">Loading…</p>
      </Shell>
    );
  if (q.error)
    return (
      <Shell>
        <p className="text-destructive">
          Could not load your booking. Check your connection — this page retries automatically.
        </p>
      </Shell>
    );
  if (!a)
    return (
      <Shell>
        <h1 className="text-3xl">Link not valid</h1>
        <p className="mt-3 text-muted-foreground">
          This tracking link has expired or was replaced. Please contact the car wash for a new one.
        </p>
        <Button asChild className="mt-6" variant="hero">
          <Link to="/book">Book a wash</Link>
        </Button>
      </Shell>
    );

  const status = a.status as ApptStatus;
  const reached = customerProgress(status);
  const done = status === "picked_up";
  const cancelled = status === "cancelled";
  const pct = cancelled
    ? 0
    : done
      ? 100
      : Math.round((reached / (CUSTOMER_STEPS.length - 1)) * 100);
  const stepAt = (s: ApptStatus) => [...a.events].reverse().find((e) => e.step === s)?.created_at;

  return (
    <Shell>
      {isNew && !done && (
        <div className="mb-6 rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="font-semibold">Booked! Save this page.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This private link shows your car's progress live. Anyone with the link can see it, so
            share it carefully.
          </p>
          <CopyLink />
        </div>
      )}

      {status === "ready" && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border-2 border-st-ready bg-st-ready/15 p-5">
          <PartyPopper className="size-10 shrink-0 text-st-ready" />
          <div>
            <p className="font-display text-2xl">Ready for pickup!</p>
            <p className="text-muted-foreground">
              Your car is clean and waiting{a.stations ? ` at bay #${a.stations.number}` : ""}.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="plate text-xl">{a.reg_number}</span>
        <span className="text-lg text-muted-foreground">
          {[a.make, a.model].filter(Boolean).join(" ")}
        </span>
      </div>
      <h1 className="mt-4 text-3xl md:text-4xl">
        {cancelled
          ? "Appointment cancelled"
          : done
            ? "All done — thank you!"
            : STATUS_LABEL[status]}
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Info label="Service" value={a.services?.name ?? "—"} />
        <Info label="Appointment" value={`${fmtDate(a.starts_at)} · ${fmtTime(a.starts_at)}`} />
        <Info
          label="Station"
          value={a.stations ? `#${a.stations.number} ${a.stations.name}` : "—"}
          icon={<MapPin className="size-4" />}
        />
        <Info
          label={done ? "Finished" : "Estimated ready"}
          value={
            done
              ? fmtTime(a.completed_at)
              : a.ready_at
                ? fmtTime(a.ready_at)
                : a.started_at
                  ? fmtTime(a.estimated_end)
                  : `~${fmtTime(a.estimated_end)}`
          }
        />
      </dl>

      {!cancelled && (
        <>
          <div
            className="mt-8 h-3 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ol className="mt-6 grid gap-1">
            {CUSTOMER_STEPS.map((s, i) => {
              const isDone =
                done || i < reached || (i === reached && i === CUSTOMER_STEPS.length - 1);
              const isNow = !done && i === reached && i !== CUSTOMER_STEPS.length - 1;
              const at = stepAt(s.status);
              return (
                <li
                  key={s.status}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                    isNow && "bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : isNow
                          ? "border-primary text-primary animate-pulse-soft"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      !isDone && !isNow && "text-muted-foreground",
                      isNow && "font-semibold",
                    )}
                  >
                    {s.label}
                  </span>
                  {at && (isDone || isNow) && (
                    <span className="font-mono text-sm text-muted-foreground">{fmtTime(at)}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {(a.extras.length > 0 || a.total > 0) && (
        <div className="mt-8 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex justify-between">
            <span>{a.services?.name}</span>
            <span>{euro(a.services?.price)}</span>
          </div>
          {a.extras.map((x, i) => (
            <div key={i} className="mt-1 flex justify-between text-muted-foreground">
              <span>+ {x.title}</span>
              <span>{euro(x.price)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>{euro(a.total)}</span>
          </div>
        </div>
      )}

      {a.messages.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg">Updates</h2>
          <ul className="mt-3 grid gap-2">
            {a.messages.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-lg border bg-card px-4 py-3 text-sm",
                  m.kind === "delay"
                    ? "border-st-washing/60"
                    : m.kind === "extra"
                      ? "border-st-quality/60"
                      : "border-border",
                )}
              >
                <span className="mr-2 font-mono text-xs text-muted-foreground">
                  {fmtTime(m.created_at)}
                </span>
                {m.body}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!done && !cancelled && "Notification" in globalThis && (
        <Button
          variant="outline"
          className="mt-8"
          disabled={notifyOn}
          onClick={async () => {
            const p = await Notification.requestPermission();
            setNotifyOn(p === "granted");
          }}
        >
          <BellRing />
          {notifyOn ? "We'll alert you while this page is open" : "Alert me when it's ready"}
        </Button>
      )}
      <p className="mt-6 text-xs text-muted-foreground">Updates automatically.</p>
    </Shell>
  );
}

function CopyLink() {
  const [ok, setOk] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-3"
      onClick={async () => {
        await navigator.clipboard.writeText(location.href.split("?")[0]!);
        setOk(true);
      }}
    >
      {ok ? <Check /> : <Copy />}
      {ok ? "Copied" : "Copy link"}
    </Button>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 font-semibold">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <Brand />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">{children}</main>
    </div>
  );
}
