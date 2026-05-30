import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Activity, Gauge, MapPin, Leaf, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoTrack — Real-Time Fleet Monitoring & Carbon Tracking" },
      { name: "description", content: "Monitor engine temperature, GPS, fuel and CO₂ emissions across your fleet in real time." },
      { property: "og:title", content: "EcoTrack — Fleet Monitoring & Sustainability" },
      { property: "og:description", content: "IoT platform for fleet health, live tracking, and carbon analytics." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Feature({ icon: Icon, title, desc }: { icon: typeof Activity; title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-6 backdrop-blur">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"><Leaf className="h-4 w-4" /></div>
          <span className="font-display text-lg font-semibold">EcoTrack</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/signup" className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90">Get started</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live IoT telemetry · CO₂ analytics
          </span>
          <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight md:text-6xl">
            Run a greener,<br /><span className="text-primary">healthier fleet.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-muted-foreground">
            Real-time engine temperature, GPS tracking, fuel usage and carbon emissions in one
            production-grade dashboard built for fleet operators.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/signup" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Create account</Link>
            <Link to="/login" className="rounded-md border px-5 py-2.5 text-sm hover:bg-accent">Sign in</Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          <Feature icon={Gauge} title="Engine health" desc="Live temperature with warning and critical thresholds, plus historical charts." />
          <Feature icon={MapPin} title="Live tracking" desc="Interactive Leaflet map with vehicle positions and route history." />
          <Feature icon={Leaf} title="Carbon analytics" desc="Automatic CO₂ calculation per fuel type with sustainability scoring." />
          <Feature icon={Activity} title="IoT ingest API" desc="POST sensor payloads from any ESP32, telematics or MQTT bridge." />
          <Feature icon={ShieldCheck} title="Role-based access" desc="Super admin, fleet manager and operator roles with RLS-protected data." />
          <Feature icon={Activity} title="Realtime alerts" desc="Instant notifications on overheating, offline devices and high emissions." />
        </div>
      </main>
    </div>
  );
}
