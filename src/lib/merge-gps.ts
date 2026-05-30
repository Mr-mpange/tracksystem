/** Merge IoT sensor_logs with browser driver_location_pings. */

export type GpsPoint = {
  latitude: number;
  longitude: number;
  speed: number | null;
  temperature?: number | null;
  created_at: string;
  source: "sensor" | "browser";
};

export function pickLatestPosition(
  sensor: GpsPoint | null | undefined,
  phone: GpsPoint | null | undefined
): GpsPoint | null {
  if (!sensor) return phone ?? null;
  if (!phone) return sensor;
  return new Date(sensor.created_at) >= new Date(phone.created_at) ? sensor : phone;
}

export function mergeTracePoints(
  sensorRows: { latitude: number | null; longitude: number | null; speed: number | null; created_at: string }[],
  phoneRows: { latitude: number; longitude: number; speed: number | null; created_at: string }[],
  limit = 80
): GpsPoint[] {
  const points: GpsPoint[] = [];
  for (const r of sensorRows) {
    if (r.latitude == null || r.longitude == null) continue;
    points.push({
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed: r.speed,
      created_at: r.created_at,
      source: "sensor",
    });
  }
  for (const r of phoneRows) {
    points.push({
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed: r.speed,
      created_at: r.created_at,
      source: "browser",
    });
  }
  points.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return points.slice(-limit);
}

/** Latest phone ping per vehicle from descending-ordered rows. */
export function latestPhoneByVehicle(
  rows: {
    vehicle_id: string | null;
    latitude: number;
    longitude: number;
    speed: number | null;
    created_at: string;
  }[]
): Record<string, GpsPoint> {
  const out: Record<string, GpsPoint> = {};
  for (const r of rows) {
    if (!r.vehicle_id || out[r.vehicle_id]) continue;
    out[r.vehicle_id] = {
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed: r.speed,
      created_at: r.created_at,
      source: "browser",
    };
  }
  return out;
}

export function isRecentlyActive(createdAt: string, maxAgeMs = 5 * 60_000): boolean {
  return Date.now() - new Date(createdAt).getTime() < maxAgeMs;
}
