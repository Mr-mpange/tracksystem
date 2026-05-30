import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Truck, MessageSquare, Navigation, Calendar, MapPin, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { mergeTracePoints, pickLatestPosition, type GpsPoint } from "@/lib/merge-gps";
import { useDriverGps } from "@/hooks/use-driver-gps";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/my-track")({
  head: () => ({ meta: [{ title: "My Track — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (!ctx.isDriver) throw redirect({ to: "/dashboard" });
  },
  component: MyTrackPage,
});

function MyTrackPage() {
  const [Map, setMap] = useState<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([RL, L]) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setMap(() => RL);
    });
  }, []);

  const { data: ctx } = useQuery({ queryKey: ["fleet-context"], queryFn: getFleetContext });
  const gpsEnabled = !!ctx?.vehicleId;
  const { tracking, error: gpsError } = useDriverGps(gpsEnabled, ctx?.driverId, ctx?.vehicleId);

  const { data, refetch } = useQuery({
    queryKey: ["driver-track", ctx?.vehicleId],
    enabled: !!ctx?.vehicleId,
    queryFn: async () => {
      const vid = ctx!.vehicleId!;
      const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const [vehicle, sensorPos, phonePos, alerts, sensorTrace, phoneTrace, sms, schedule] = await Promise.all([
        supabase.from("vehicles").select("*").eq("id", vid).maybeSingle(),
        supabase
          .from("sensor_logs")
          .select("latitude,longitude,temperature,speed,created_at")
          .eq("vehicle_id", vid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("driver_location_pings")
          .select("latitude,longitude,speed,created_at")
          .eq("vehicle_id", vid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("alerts")
          .select("id,message,severity,status,created_at")
          .eq("vehicle_id", vid)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("sensor_logs")
          .select("latitude,longitude,speed,created_at")
          .eq("vehicle_id", vid)
          .not("latitude", "is", null)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("driver_location_pings")
          .select("latitude,longitude,speed,created_at")
          .eq("vehicle_id", vid)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("sms_logs")
          .select("message,status,created_at")
          .eq("driver_id", ctx!.driverId!)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("driver_schedules")
          .select("title, scheduled_at, location, status, route_status, routes(name, waypoints)")
          .eq("driver_id", ctx!.driverId!)
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString())
          .lte("scheduled_at", weekAhead)
          .order("scheduled_at", { ascending: true })
          .limit(5),
      ]);

      const sensorPoint: GpsPoint | null = sensorPos.data?.latitude
        ? {
            latitude: Number(sensorPos.data.latitude),
            longitude: Number(sensorPos.data.longitude),
            speed: sensorPos.data.speed,
            temperature: sensorPos.data.temperature,
            created_at: sensorPos.data.created_at,
            source: "sensor",
          }
        : null;

      const phonePoint: GpsPoint | null = phonePos.data
        ? {
            latitude: Number(phonePos.data.latitude),
            longitude: Number(phonePos.data.longitude),
            speed: phonePos.data.speed,
            created_at: phonePos.data.created_at,
            source: "browser",
          }
        : null;

      const position = pickLatestPosition(sensorPoint, phonePoint);
      const trace = mergeTracePoints(sensorTrace.data ?? [], phoneTrace.data ?? []);

      const active = (schedule.data ?? [])[0] as any;
      const waypoints = (active?.routes?.waypoints ?? []) as { lat: number; lng: number }[];
      return {
        vehicle: vehicle.data,
        position,
        alerts: alerts.data ?? [],
        trace,
        sms: sms.data ?? [],
        schedule: schedule.data ?? [],
        assignedRoute: waypoints,
        routeStatus: active?.route_status ?? null,
        routeName: active?.routes?.name ?? null,
      };
    },
  });

  useEffect(() => {
    if (!ctx?.vehicleId) return;
    const ch = supabase
      .channel("driver-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_logs" }, () => refetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_location_pings" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ctx?.vehicleId, refetch]);

  if (!ctx?.vehicleId) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl font-semibold">My Track</h1>
        <p className="mt-2 text-muted-foreground">No vehicle assigned yet. Contact your fleet admin.</p>
      </div>
    );
  }

  if (!Map) return <div className="p-8 text-muted-foreground">Loading map…</div>;
  const { MapContainer, TileLayer, Marker, Popup, Polyline } = Map;
  const assignedRoute: [number, number][] = (data?.assignedRoute ?? []).map((w: any) => [w.lat, w.lng]);
  const pos = data?.position;
  const center: [number, number] = pos?.latitude
    ? [Number(pos.latitude), Number(pos.longitude)]
    : [-6.7924, 39.2083];
  const traceLine: [number, number][] = (data?.trace ?? [])
    .filter((p: GpsPoint) => p.latitude && p.longitude)
    .map((p: GpsPoint) => [Number(p.latitude), Number(p.longitude)]);

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] md:h-screen">
      <div className="border-b bg-card px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" /> My Track
          </h1>
          <p className="text-sm text-muted-foreground">
            {data?.vehicle?.plate_number} · {data?.vehicle?.model}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm items-center">
          <Badge variant={tracking ? "default" : "secondary"} className="gap-1">
            <MapPin className="h-3 w-3" />
            {tracking ? "Phone GPS active" : "Enable location in browser"}
          </Badge>
          {gpsError && <span className="text-xs text-destructive">{gpsError}</span>}
          {pos && (
            <>
              {pos.temperature != null && <span>Temp: {pos.temperature}°C</span>}
              <span>Speed: {pos.speed ?? "—"} km/h</span>
              <Badge variant="outline" className="text-[10px] capitalize">
                {pos.source === "browser" ? "Phone GPS" : "IoT"}
              </Badge>
              <span className="text-muted-foreground">{new Date(pos.created_at).toLocaleTimeString()}</span>
            </>
          )}
          {data?.routeName && (
            <Badge variant={data.routeStatus === "off_route" ? "destructive" : "default"}>
              {data.routeName} — {data.routeStatus === "off_route" ? "Off route" : data.routeStatus === "on_route" ? "On route" : "Pending"}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <div className="flex-1 min-h-[280px]">
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution="&copy; OSM" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {assignedRoute.length > 1 && (
              <Polyline
                positions={assignedRoute}
                color={data?.routeStatus === "off_route" ? "#ef4444" : "#3b82f6"}
                weight={5}
                opacity={0.9}
              />
            )}
            {traceLine.length > 1 && <Polyline positions={traceLine} color="#22c55e" weight={4} opacity={0.7} dashArray="8 8" />}
            {pos?.latitude && (
              <Marker position={[Number(pos.latitude), Number(pos.longitude)]}>
                <Popup>
                  <div className="font-semibold">{data?.vehicle?.plate_number}</div>
                  <div>Live position ({pos.source === "browser" ? "phone" : "IoT"})</div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l overflow-y-auto p-4 space-y-6 bg-card">
          <section className="rounded-lg border p-3 bg-muted/20 text-xs text-muted-foreground">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <Radio className="h-3 w-3" /> No IoT device needed
            </p>
            <p className="mt-1">Keep this page open on your phone and allow location access. Position updates every ~20 seconds.</p>
          </section>

          <section>
            <h2 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4" /> My schedule
            </h2>
            <div className="space-y-2">
              {(data?.schedule ?? []).map((s: any, i: number) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{s.title}</div>
                  {s.routes?.name && <div className="text-xs text-primary">Route: {s.routes.name}</div>}
                  {s.route_status && s.route_status !== "not_started" && (
                    <Badge variant={s.route_status === "off_route" ? "destructive" : "secondary"} className="mt-1 text-[10px]">
                      {s.route_status.replace("_", " ")}
                    </Badge>
                  )}
                  {s.location && <div className="text-xs text-muted-foreground">{s.location}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(s.scheduled_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {(data?.schedule?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming trips. Dial USSD → 1 for schedule.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4" /> Alerts
            </h2>
            <div className="space-y-2">
              {(data?.alerts ?? []).map((a: any) => (
                <div key={a.id} className="rounded-lg border p-3 text-sm">
                  <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="mb-1 capitalize">
                    {a.severity}
                  </Badge>
                  <div>{a.message}</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))}
              {(data?.alerts?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No alerts for your vehicle.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4" /> SMS notifications
            </h2>
            <div className="space-y-2">
              {(data?.sms ?? []).map((s: any, i: number) => (
                <div key={i} className="rounded-lg border p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="capitalize">{s.status}</span>
                    <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 opacity-80 line-clamp-2">{s.message}</div>
                </div>
              ))}
              {(data?.sms?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">SMS alerts appear here when triggered.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4" /> Route trace
            </h2>
            <p className="text-xs text-muted-foreground">{traceLine.length} recent GPS points (phone + IoT)</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
