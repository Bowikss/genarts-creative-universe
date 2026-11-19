import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/Brand";
import { STATION_STATE_LABEL, type StationState } from "@/lib/workflow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Genarts — Book a car wash & track it live" },
      { name: "description", content: "Book your wash in seconds and follow your car live from arrival to pickup." },
      { property: "og:title", content: "Genarts — Book a car wash & track it live" },
      { property: "og:description", content: "Book your wash in seconds and follow your car live from arrival to pickup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STATES: StationState[] = ["available", "arrived", "washing", "quality", "ready", "maintenance"];
const DOT: Record<StationState, string> = {
  available: "bg-st-available", arrived: "bg-st-arrived", washing: "bg-st-washing",
  quality: "bg-st-quality", ready: "bg-st-ready", maintenance: "bg-st-maintenance",
};

function Index() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Staff sign in</Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 md:grid-cols-2 md:pt-24">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">Car wash, live</p>
          <h1 className="text-5xl leading-[1.05] md:text-7xl">Shine on schedule.</h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Pick a service and a time. We assign the best free bay and send you a live link to follow every step until your car is ready.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild variant="hero" size="lg"><Link to="/book">Book a wash</Link></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {STATES.map((s, i) => (
            <div key={s} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="font-display text-3xl">0{i + 1}</span>
                <span className={`size-3 rounded-full ${DOT[s]} ${s === "washing" ? "animate-pulse-soft" : ""}`} />
              </div>
              <p className="mt-6 text-sm text-muted-foreground">Bay status</p>
              <p className="font-semibold">{STATION_STATE_LABEL[s]}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
