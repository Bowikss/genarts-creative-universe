import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/book")({
  head: () => ({ meta: [{ title: "Book a wash — Genarts" }, { name: "description", content: "Book a wash at Genarts." }, { property: "og:title", content: "Book a wash — Genarts" }, { property: "og:description", content: "Book a wash at Genarts." }] }),
  component: () => (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-4xl">Book a wash</h1><p className="mt-4 text-muted-foreground">This screen is not finished yet.</p></main>
    </div>
  ),
});
