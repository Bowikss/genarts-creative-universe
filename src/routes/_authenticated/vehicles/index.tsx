import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StaffNav } from "@/components/StaffNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/vehicles/")({
  head: () => ({
    meta: [{ title: "Vehicles — Genarts" }, { name: "description", content: "Vehicle history." }],
  }),
  component: Vehicles,
});

function Vehicles() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const recent = useQuery({
    queryKey: ["recent-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("reg_number,make,model,starts_at,customer_name")
        .neq("status", "cancelled")
        .lte("starts_at", new Date(Date.now() + 86400000).toISOString())
        .order("starts_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      const seen = new Map<
        string,
        { reg: string; vehicle: string; last: string; visits: number; customer: string }
      >();
      for (const a of data) {
        const v = seen.get(a.reg_number);
        if (v) v.visits++;
        else
          seen.set(a.reg_number, {
            reg: a.reg_number,
            vehicle: [a.make, a.model].filter(Boolean).join(" "),
            last: a.starts_at,
            visits: 1,
            customer: a.customer_name,
          });
      }
      return [...seen.values()];
    },
  });
  const filtered = (recent.data ?? []).filter(
    (v) =>
      !q ||
      `${v.reg} ${v.vehicle} ${v.customer}`
        .toLowerCase()
        .includes(q.toLowerCase().replace(/\s+/g, "")),
  );
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim())
      navigate({
        to: "/vehicles/$reg",
        params: { reg: q.trim().toUpperCase().replace(/\s+/g, "") },
      });
  };

  return (
    <div className="min-h-screen pb-12">
      <StaffNav />
      <main className="mx-auto max-w-4xl px-4 py-4">
        <h1 className="text-3xl md:text-4xl">Vehicle history</h1>
        <form onSubmit={go} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              className="h-10 pl-9 uppercase"
              placeholder="Registration number"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-10">
            Show history
          </Button>
        </form>
        <div className="mt-6 grid gap-2">
          {recent.isLoading && <p className="text-muted-foreground">Loading…</p>}
          {filtered.map((v) => (
            <Link
              key={v.reg}
              to="/vehicles/$reg"
              params={{ reg: v.reg }}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary"
            >
              <span className="plate">{v.reg}</span>
              <span className="font-semibold">{v.vehicle}</span>
              <span className="text-sm text-muted-foreground">{v.customer}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {v.visits} visit{v.visits > 1 ? "s" : ""} · last {fmtDate(v.last)}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
