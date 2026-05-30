import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({ meta: [{ title: "Live Map — EcoTrack" }] }),
  component: MapPage,
});

function MapPage() {
  const [Map, setMap] = useState<any>(null);

  useEffect(() => {
    // Client-only import of react-leaflet (avoids SSR window errors)
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([RL, L]) => {
      // Fix default marker icons
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
    queryKey: ["latest-positions"],
    queryFn: async () => {
      // Latest position per vehicle
      const { data: rows } = await supabase
        .from("sensor_logs")
        .select("vehicle_id,latitude,longitude,temperature,speed,created_at,vehicles(plate_number)")
        .order("created_at", { ascending: false })
        .limit(500);
      const seen = new Set<string>(); const out: any[] = [];
      for (const r of rows ?? []) {
        if (!r.vehicle_id || seen.has(r.vehicle_id) || !r.latitude || !r.longitude) continue;
        seen.add(r.vehicle_id); out.push(r);
      }
      return out;
    },
  });

  useEffect(() => {
    const ch = supabase.channel("map-rt").on("postgres_changes", { event: "INSERT", schema: "public", table: "sensor_logs" }, () => refetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  if (!Map) return <div className="p-8 text-muted-foreground">Loading map…</div>;
  const { MapContainer, TileLayer, Marker, Popup } = Map;
  const center: [number, number] = data?.[0] ? [Number(data[0].latitude), Number(data[0].longitude)] : [-6.7924, 39.2083];

  return (
    <div className="h-screen">
      <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {(data ?? []).map((r: any) => (
          <Marker key={r.vehicle_id} position={[Number(r.latitude), Number(r.longitude)]}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{r.vehicles?.plate_number ?? "Vehicle"}</div>
                <div>Temp: {r.temperature}°C</div>
                <div>Speed: {r.speed} km/h</div>
                <div className="text-xs opacity-70">{new Date(r.created_at).toLocaleTimeString()}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
