import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — EcoTrack" }] }),
  component: ReportsPage,
});

function toCSV(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function download(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["report-monthly"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data: logs } = await supabase.from("carbon_logs").select("emission_kg,fuel_used,created_at").gte("created_at", since.toISOString());
      // Group by day
      const byDay: Record<string, { day: string; co2: number; fuel: number }> = {};
      for (const r of logs ?? []) {
        const day = r.created_at.slice(0, 10);
        byDay[day] ??= { day, co2: 0, fuel: 0 };
        byDay[day].co2 += Number(r.emission_kg);
        byDay[day].fuel += Number(r.fuel_used);
      }
      return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
    },
  });

  const exportCsv = async (range: "daily" | "weekly" | "monthly") => {
    const days = range === "daily" ? 1 : range === "weekly" ? 7 : 30;
    const since = new Date(); since.setDate(since.getDate() - days);
    const { data: rows } = await supabase.from("carbon_logs").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false });
    download(`ecotrack-${range}-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows ?? []));
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div><h1 className="font-display text-3xl font-semibold">Reports</h1><p className="text-sm text-muted-foreground">Emission and fuel summaries.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => exportCsv("daily")}><Download className="mr-2 h-4 w-4" />Daily CSV</Button>
        <Button variant="outline" onClick={() => exportCsv("weekly")}><Download className="mr-2 h-4 w-4" />Weekly CSV</Button>
        <Button variant="outline" onClick={() => exportCsv("monthly")}><Download className="mr-2 h-4 w-4" />Monthly CSV</Button>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 text-sm font-medium">CO₂ Emissions — last 30 days (kg)</div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data ?? []}>
              <CartesianGrid stroke="oklch(1 0 0 / 8%)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.68 0.02 250)" }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.02 250)" }} />
              <Tooltip contentStyle={{ background: "oklch(0.20 0.02 250)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8 }} />
              <Bar dataKey="co2" fill="oklch(0.72 0.17 160)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
