import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alerts — EcoTrack" }] }),
  component: AlertsPage,
});

const sevColor: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning/20 text-warning",
  critical: "bg-destructive/20 text-destructive",
};

function AlertsPage() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => (await supabase.from("alerts").select("*, vehicles(plate_number)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  useEffect(() => {
    const ch = supabase.channel("alerts-rt").on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const resolve = async (id: string) => {
    await supabase.from("alerts").update({ status: "resolved" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div><h1 className="font-display text-3xl font-semibold">Alerts</h1><p className="text-sm text-muted-foreground">Active and recent system alerts.</p></div>
      <div className="space-y-2">
        {(data ?? []).map((a: any) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${sevColor[a.severity]}`}>{a.severity}</span>
              <div>
                <div className="font-medium">{a.message}</div>
                <div className="text-xs text-muted-foreground">{a.vehicles?.plate_number ?? "Unknown vehicle"} · {new Date(a.created_at).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">{a.status}</span>
              {a.status !== "resolved" && <Button size="sm" variant="ghost" onClick={() => resolve(a.id)}><Check className="mr-1 h-4 w-4" />Resolve</Button>}
            </div>
          </div>
        ))}
        {(data?.length ?? 0) === 0 && <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">No alerts yet.</div>}
      </div>
    </div>
  );
}
