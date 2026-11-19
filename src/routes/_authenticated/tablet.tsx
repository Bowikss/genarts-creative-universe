import { createFileRoute } from "@tanstack/react-router";
import { StaffNav } from "@/components/StaffNav";
export const Route = createFileRoute("/_authenticated/tablet")({
  head: () => ({ meta: [{ title: "Employee Tablet — Genarts" }, { name: "description", content: "Employee Tablet at Genarts." }, { property: "og:title", content: "Employee Tablet — Genarts" }, { property: "og:description", content: "Employee Tablet at Genarts." }] }),
  component: () => (
    <div className="min-h-screen"><StaffNav />
      <main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-4xl">Employee Tablet</h1><p className="mt-4 text-muted-foreground">This screen is not finished yet.</p></main>
    </div>
  ),
});
