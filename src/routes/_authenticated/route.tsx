import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadMe, useStaff } from "@/hooks/use-staff";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData({ queryKey: ["me"], queryFn: loadMe });
    if (!me) throw redirect({ to: "/auth" });
    return { me };
  },
  component: Gate,
});

/** Signed in but no role yet: wait for an admin. RLS hides all data anyway. */
function Gate() {
  const { data: me, refetch, isFetching } = useStaff();
  const qc = useQueryClient();
  if (me && !me.isStaff) {
    return (
      <div className="grid min-h-screen place-items-center bg-hero px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
          <Brand />
          <h1 className="mt-6 text-2xl">Waiting for approval</h1>
          <p className="mt-2 text-muted-foreground">
            Your account <b className="text-foreground">{me.user.email}</b> is created. An
            administrator needs to give you access (Admin → Staff) before you can use the staff
            area.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={() => refetch()} disabled={isFetching}>
              Check again
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                qc.clear();
                await supabase.auth.signOut();
                location.href = "/auth";
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return <Outlet />;
}
