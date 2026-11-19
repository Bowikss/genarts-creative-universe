import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BoardGrid,
  Clock,
  FullscreenButton,
  Legend,
  StationTile,
  UpcomingList,
} from "@/components/board";
import { getDisplay } from "@/lib/public.functions";

// Public lobby screen. No login: protected by the display key (Admin → Settings),
// shows masked plates only — no names, phones or staff.
export const Route = createFileRoute("/display/$key")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Live stations — Genarts" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: Display,
});

function Display() {
  const { key } = Route.useParams();
  const q = useQuery({
    queryKey: ["display", key],
    queryFn: () => getDisplay({ data: { key } }),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: true,
  });
  if (q.isLoading)
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  if (q.data === null)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center text-xl">
        This display link is not valid. Get the current link in Admin → Settings.
      </div>
    );
  const d = q.data;
  return (
    <div className="min-h-screen bg-hero px-4 py-5 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">{d?.business ?? "Genarts"}</h1>
          <Legend className="mt-2" />
        </div>
        <div className="flex items-center gap-4">
          <FullscreenButton />
          <Clock />
        </div>
      </header>
      {q.error && (
        <p className="mb-4 rounded-lg bg-destructive/20 px-4 py-2 text-sm">
          Connection lost — retrying…
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <BoardGrid>
          {d?.stations.map((s) => (
            <StationTile
              key={s.number}
              number={s.number}
              name={s.name}
              state={s.state}
              plate={s.current?.plate}
              status={s.current?.status}
              service={s.current?.service}
              startedAt={s.current?.started_at}
              startsAt={s.current?.starts_at}
              estimate={s.current?.estimated_end}
              delayed={s.delayed}
              waiting={s.waiting}
              next={s.next ? { time: s.next.starts_at } : null}
              maintenance={s.maintenanceUntil ? { until: s.maintenanceUntil } : null}
              big
            />
          ))}
        </BoardGrid>
        <UpcomingList
          items={(d?.upcoming ?? []).map((u, i) => ({
            id: String(i),
            time: u.starts_at,
            plate: u.plate,
            service: u.service,
            station: u.station,
          }))}
        />
      </div>
    </div>
  );
}
