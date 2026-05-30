import { useEffect, useState } from "react";
import { Undo2, Trash2, MapPin, Crosshair, Route } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SAMPLE_ROUTE_WAYPOINTS, type Waypoint } from "@/lib/route-geo";

type Props = {
  waypoints: Waypoint[];
  onChange: (waypoints: Waypoint[]) => void;
  height?: string;
  onUseSample?: () => void;
};

export function RouteDrawMap({ waypoints, onChange, height = "320px", onUseSample }: Props) {
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

  if (!Map) {
    return (
      <div className="rounded-lg border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Loading map…
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Polyline, useMapEvents } = Map;

  function ClickCapture({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
    useMapEvents({
      click(e: { latlng: { lat: number; lng: number } }) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  const positions: [number, number][] = waypoints.map((w) => [w.lat, w.lng]);
  const center: [number, number] = positions[0] ?? [-6.7924, 39.2083];

  const addPoint = (lat: number, lng: number) => {
    onChange([...waypoints, { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }]);
  };

  const undo = () => onChange(waypoints.slice(0, -1));
  const clear = () => onChange([]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Location not available");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: Waypoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          label: "You",
        };
        onChange(waypoints.length ? [point, ...waypoints.slice(1)] : [point, ...SAMPLE_ROUTE_WAYPOINTS.slice(1)]);
        toast.success("Start point set from your location");
      },
      (err) => toast.error(err.message),
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  };

  const loadSample = () => {
    onChange([...SAMPLE_ROUTE_WAYPOINTS]);
    onUseSample?.();
    toast.message("Sample route loaded — edit on the map or save as-is");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Click map to add points ({waypoints.length})
        </p>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="secondary" size="sm" onClick={loadSample}>
            <Route className="h-3 w-3 mr-1" /> Sample path
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
            <Crosshair className="h-3 w-3 mr-1" /> My location
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={undo} disabled={waypoints.length === 0}>
            <Undo2 className="h-3 w-3 mr-1" /> Undo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={waypoints.length === 0}>
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      </div>
      <div className="rounded-lg border overflow-hidden" style={{ height }}>
        <MapContainer center={center} zoom={positions.length ? 12 : 11} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OSM" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickCapture onMapClick={addPoint} />
          {positions.length > 1 && <Polyline positions={positions} color="#3b82f6" weight={4} />}
          {waypoints.map((w, i) => (
            <Marker key={`${w.lat}-${w.lng}-${i}`} position={[w.lat, w.lng]} />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
