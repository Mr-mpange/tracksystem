import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ClipboardList, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/driver-reports")({
  head: () => ({ meta: [{ title: "Driver Reports — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isAdmin) throw redirect({ to: "/my-track" });
  },
  component: DriverReportsPage,
});

const statusColor: Record<string, string> = {
  open: "bg-warning/20 text-warning",
  reviewed: "bg-primary/20 text-primary",
  resolved: "bg-muted text-muted-foreground",
};

function DriverReportsPage() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["driver-reports"],
    queryFn: async () =>
      (
        await supabase
          .from("driver_reports")
          .select("*, drivers(full_name, phone)")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });

  useEffect(() => {
    const ch = supabase
      .channel("reports-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_reports" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const updateStatus = async (id: string, status: "reviewed" | "resolved") => {
    await supabase.from("driver_reports").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["driver-reports"] });
  };

  const openCount = (data ?? []).filter((r: any) => r.status === "open").length;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-primary" />
          Driver reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Messages from drivers via USSD (option 2). {openCount} open.
        </p>
      </div>

      <div className="space-y-2">
        {(data ?? []).map((r: any) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColor[r.status]}`}>
                    {r.status}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase">{r.source}</span>
                </div>
                <div className="mt-2 font-medium">{r.drivers?.full_name ?? "Unknown"} · {r.phone_number}</div>
                <p className="mt-2 text-sm">{r.message}</p>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {r.status === "open" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "reviewed")}>
                      Review
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "resolved")}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {r.status === "reviewed" && (
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, "resolved")}>
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {(data?.length ?? 0) === 0 && (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            No driver reports yet. Drivers use USSD option 2 to report issues.
          </div>
        )}
      </div>
    </div>
  );
}
