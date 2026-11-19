import { createFileRoute } from "@tanstack/react-router";
import { StaffNav } from "@/components/StaffNav";
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Station Dashboard — Genarts" }, { name: "description", content: "Station Dashboard at Genarts." }, { property: "og:title", content: "Station Dashboard — Genarts" }, { property: "og:description", content: "Station Dashboard at Genarts." }] }),
  component: () => (
    <div className="min-h-screen"><StaffNav />
      <main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-4xl">Station Dashboard</h1><p className="mt-4 text-muted-foreground">This screen is not finished yet.</p></main>
    </div>
  ),
});
