import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, Radio, User, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFleetContext } from "@/lib/fleet-auth";
import { isRecentlyActive, latestPhoneByVehicle, pickLatestPosition, type GpsPoint } from "@/lib/merge-gps";
import { Badge } from "@/components/ui/badge";
import type { Waypoint } from "@/lib/route-geo";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({ meta: [{ title: "Live Map — EcoTrack" }] }),
  beforeLoad: async () => {
    const ctx = await getFleetContext();
    if (ctx.isDriver) throw redirect({ to: "/my-track" });
  },
  component: MapPage,
});

type FleetMarker = {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  temperature: number | null;
  speed: number | null;
  created_at: string;
  source: "sensor" | "browser";
  plate_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  device_status: string | null;
  route_status: string | null;
  route_name: string | null;
  is_live: boolean;
};

type RouteLine = {
  vehicle_id: string;
  name: string;
  positions: [number, number][];
  route_status: string | null;
};

function MapPage() {
  const [Map, setMap] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  const { data, refetch } = useQuery({
    queryKey: ["admin-live-map"],
    queryFn: async (): Promise<{ markers: FleetMarker[]; routeLines: RouteLine[] }> => {
      const [{ data: rows }, { data: phoneRows }, { data: drivers }, { data: devices }, { data: schedules }, { data: vehicles }] =
        await Promise.all([
          supabase
            .from("sensor_logs")
            .select("vehicle_id, latitude, longitude, temperature, speed, created_at, vehicles(plate_number)")
            .order("created_at", { ascending: false })
            .limit(800),
          supabase
            .from("driver_location_pings")
            .select("vehicle_id, latitude, longitude, speed, created_at")
            .not("vehicle_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase.from("drivers").select("full_name, phone, vehicle_id"),
          supabase.from("devices").select("vehicle_id, status"),
          supabase
            .from("driver_schedules")
            .select("route_status, routes(name, waypoints), drivers(vehicle_id)")
            .eq("status", "scheduled")
            .not("route_id", "is", null),
          supabase.from("vehicles").select("id, plate_number"),
        ]);

      const driverByVehicle: Record<string, { full_name: string; phone: string | null }> = {};
      for (const d of drivers ?? []) {
        if (d.vehicle_id) driverByVehicle[d.vehicle_id] = d;
      }
      const deviceByVehicle: Record<string, { status: string }> = {};
      for (const d of devices ?? []) {
        if (d.vehicle_id) deviceByVehicle[d.vehicle_id] = d;
      }
      const plateByVehicle: Record<string, string> = {};
      for (const v of vehicles ?? []) {
        plateByVehicle[v.id] = v.plate_number;
      }

      const scheduleByVehicle: Record<string, any> = {};
      for (const sch of schedules ?? []) {
        const vid = (sch.drivers as { vehicle_id?: string } | null)?.vehicle_id;
        if (vid) scheduleByVehicle[vid] = sch;
      }

      const phoneByVehicle = latestPhoneByVehicle(phoneRows ?? []);

      const latestSensorByVehicle: Record<string, GpsPoint & { temperature: number | null }> = {};
      for (const r of rows ?? []) {
        if (!r.vehicle_id || latestSensorByVehicle[r.vehicle_id] || !r.latitude || !r.longitude) continue;
        latestSensorByVehicle[r.vehicle_id] = {
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          speed: r.speed,
          temperature: r.temperature,
          created_at: r.created_at,
          source: "sensor",
        };
      }

      const vehicleIds = new Set([
        ...Object.keys(latestSensorByVehicle),
        ...Object.keys(phoneByVehicle),
      ]);

      const markers: FleetMarker[] = [];
      const routeLines: RouteLine[] = [];

      for (const vehicleId of vehicleIds) {
        const merged = pickLatestPosition(latestSensorByVehicle[vehicleId], phoneByVehicle[vehicleId]);
        if (!merged) continue;

        const drv = driverByVehicle[vehicleId];
        const dev = deviceByVehicle[vehicleId];
        const sch = scheduleByVehicle[vehicleId];
        const route = sch?.routes as { name?: string; waypoints?: Waypoint[] } | null;
        const iotOnline = dev?.status === "online";
        const phoneLive = merged.source === "browser" && isRecentlyActive(merged.created_at);

        markers.push({
          vehicle_id: vehicleId,
          latitude: merged.latitude,
          longitude: merged.longitude,
          temperature: latestSensorByVehicle[vehicleId]?.temperature ?? null,
          speed: merged.speed,
          created_at: merged.created_at,
          source: merged.source,
          plate_number: plateByVehicle[vehicleId] ?? "Vehicle",
          driver_name: drv?.full_name ?? null,
          driver_phone: drv?.phone ?? null,
          device_status: iotOnline ? "online" : phoneLive ? "phone" : dev?.status ?? null,
          route_status: sch?.route_status ?? null,
          route_name: route?.name ?? null,
          is_live: iotOnline || phoneLive,
        });

        if (route?.waypoints?.length && route.waypoints.length >= 2) {
          routeLines.push({
            vehicle_id: vehicleId,
            name: route.name ?? "Route",
            route_status: sch?.route_status ?? null,
            positions: route.waypoints.map((w) => [w.lat, w.lng] as [number, number]),
          });
        }
      }

      return { markers, routeLines };
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-map-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_logs" }, () => refetch())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_location_pings" }, () => refetch())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "driver_schedules" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  if (!Map) return <div className="p-8 text-muted-foreground">Loading map…</div>;
  const { MapContainer, TileLayer, Marker, Popup, Polyline } = Map;
  const markers = data?.markers ?? [];
  const routeLines = data?.routeLines ?? [];
  const center: [number, number] = markers[0]
    ? [markers[0].latitude, markers[0].longitude]
    : [-6.7924, 39.2083];
  const onlineCount = markers.filter((m) => m.is_live).length;

  const routeColor = (status: string | null) => {
    if (status === "on_route") return "#22c55e";
    if (status === "off_route") return "#ef4444";
    return "#3b82f6";
  };

  return (
    <div className="flex h-screen">
      <aside className="w-80 border-r bg-card overflow-y-auto hidden md:block">
        <div className="p-4 border-b">
          <h1 className="font-display text-xl font-semibold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Live fleet map
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {markers.length} vehicles · {onlineCount} live (IoT or phone GPS) · green/red = on/off route
          </p>
        </div>
        <div className="p-2 space-y-1">
          {markers.map((m) => (
            <button
              key={m.vehicle_id}
              type="button"
              onClick={() => setSelected(m.vehicle_id)}
              className={`w-full text-left rounded-lg border p-3 text-sm transition ${
                selected === m.vehicle_id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <div className="font-medium">{m.plate_number}</div>
              {m.driver_name && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <User className="h-3 w-3" /> {m.driver_name}
                </div>
              )}
              {m.route_name && (
                <div className="text-xs mt-1 text-muted-foreground">Route: {m.route_name}</div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant={m.is_live ? "default" : "secondary"} className="text-[10px]">
                  {m.device_status === "phone" ? (
                    <Smartphone className="h-3 w-3 mr-1" />
                  ) : (
                    <Radio className="h-3 w-3 mr-1" />
                  )}
                  {m.device_status === "phone" ? "phone GPS" : m.device_status ?? "unknown"}
                </Badge>
                {m.route_status && (
                  <Badge
                    variant={m.route_status === "off_route" ? "destructive" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {m.route_status.replace("_", " ")}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{m.speed ?? 0} km/h</span>
              </div>
            </button>
          ))}
          {markers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No GPS yet. Drivers open My Track on their phone, or connect IoT devices.
            </p>
          )}
        </div>
      </aside>

      <div className="flex-1 relative">
        <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OSM" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {routeLines.map((line) => (
            <Polyline
              key={line.vehicle_id}
              positions={line.positions}
              color={routeColor(line.route_status)}
              weight={selected === line.vehicle_id ? 6 : 4}
              opacity={selected && selected !== line.vehicle_id ? 0.3 : 0.85}
            />
          ))}
          {markers.map((m) => (
            <Marker
              key={m.vehicle_id}
              position={[m.latitude, m.longitude]}
              eventHandlers={{ click: () => setSelected(m.vehicle_id) }}
            >
              <Popup>
                <div className="space-y-1 min-w-[160px]">
                  <div className="font-semibold">{m.plate_number}</div>
                  {m.driver_name && <div className="text-sm">Driver: {m.driver_name}</div>}
                  {m.route_name && <div className="text-sm">Route: {m.route_name}</div>}
                  {m.route_status && (
                    <div className="text-sm capitalize">Status: {m.route_status.replace("_", " ")}</div>
                  )}
                  <div className="text-sm capitalize">GPS: {m.source === "browser" ? "Phone" : "IoT sensor"}</div>
                  {m.temperature != null && <div>Temp: {m.temperature}°C</div>}
                  <div>Speed: {m.speed ?? 0} km/h</div>
                  <div className="text-xs opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
