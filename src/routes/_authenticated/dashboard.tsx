import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Truck, Wifi, WifiOff, AlertTriangle, Leaf, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — EcoTrack" }] }),
  component: Dashboard,
});

function Stat({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Truck; label: string; value: string | number; hint?: string; tone?: "default" | "primary" | "warning" | "destructive" }) {
  const tones = { default: "text-muted-foreground", primary: "text-primary", warning: "text-warning", destructive: "text-destructive" };
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tones[tone]}`} />
      </div>
      <div className="mt-3 font-display text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const { data, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const [v, d, a, today, month, recent] = await Promise.all([
        supabase.from("vehicles").select("id,status", { count: "exact" }),
        supabase.from("devices").select("id,status,last_seen"),
        supabase.from("alerts").select("id", { count: "exact" }).eq("status", "open"),
        supabase.from("carbon_logs").select("emission_kg").gte("created_at", startOfDay.toISOString()),
        supabase.from("carbon_logs").select("emission_kg").gte("created_at", startOfMonth.toISOString()),
        supabase.from("sensor_logs").select("created_at,temperature").order("created_at", { ascending: false }).limit(50),
      ]);
      const onlineCutoff = Date.now() - 5 * 60 * 1000;
      const devices = d.data ?? [];
      const online = devices.filter((x) => x.last_seen && new Date(x.last_seen).getTime() > onlineCutoff).length;
      return {
        totalVehicles: v.count ?? 0,
        onlineVehicles: online,
        offlineVehicles: devices.length - online,
        activeAlerts: a.count ?? 0,
        todayCO2: (today.data ?? []).reduce((s, r) => s + Number(r.emission_kg), 0),
        monthCO2: (month.data ?? []).reduce((s, r) => s + Number(r.emission_kg), 0),
        tempSeries: (recent.data ?? []).slice().reverse().map((r) => ({ t: new Date(r.created_at).toLocaleTimeString(), temp: Number(r.temperature) })),
      };
    },
  });

  // Realtime: refetch on new sensor logs or alerts
  useEffect(() => {
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sensor_logs" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live fleet health and sustainability metrics.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Truck} label="Total Vehicles" value={data?.totalVehicles ?? 0} />
        <Stat icon={Wifi} label="Online" value={data?.onlineVehicles ?? 0} tone="primary" hint="Device seen < 5 min" />
        <Stat icon={WifiOff} label="Offline" value={data?.offlineVehicles ?? 0} />
        <Stat icon={AlertTriangle} label="Active Alerts" value={data?.activeAlerts ?? 0} tone={data?.activeAlerts ? "destructive" : "default"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat icon={Leaf} label="Today's CO₂" value={`${(data?.todayCO2 ?? 0).toFixed(1)} kg`} tone="primary" />
        <Stat icon={Leaf} label="This Month CO₂" value={`${(data?.monthCO2 ?? 0).toFixed(1)} kg`} tone="primary" />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-primary" /> Engine Temperature (latest 50)</div>
            <p className="text-xs text-muted-foreground">Real-time readings across all devices</p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.tempSeries ?? []}>
              <CartesianGrid stroke="oklch(1 0 0 / 8%)" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 11, fill: "oklch(0.68 0.02 250)" }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.02 250)" }} unit="°" />
              <Tooltip contentStyle={{ background: "oklch(0.20 0.02 250)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="temp" stroke="oklch(0.72 0.17 160)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
