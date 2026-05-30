/** Geo helpers for route compliance (no PostGIS). */

export type Waypoint = { lat: number; lng: number; label?: string };

const R = 6371000; // Earth radius metres

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Shortest distance from point to polyline (metres). */
export function distanceToRouteMeters(lat: number, lng: number, waypoints: Waypoint[]): number {
  if (waypoints.length === 0) return Infinity;
  if (waypoints.length === 1) {
    return haversineMeters(lat, lng, waypoints[0].lat, waypoints[0].lng);
  }

  let min = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = distanceToSegmentMeters(
      lat,
      lng,
      waypoints[i].lat,
      waypoints[i].lng,
      waypoints[i + 1].lat,
      waypoints[i + 1].lng
    );
    if (d < min) min = d;
  }
  return min;
}

function distanceToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  // Project on lat/lng plane (good enough for short urban routes)
  const ax = aLng;
  const ay = aLat;
  const bx = bLng;
  const by = bLat;
  const px = pLng;
  const py = pLat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;

  let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return haversineMeters(pLat, pLng, cy, cx);
}

export function parseWaypointsText(text: string): Waypoint[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split(/[,\s]+/).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return { lat: a, lng: b };
    })
    .filter((w): w is Waypoint => w !== null);
}

export function waypointsToText(waypoints: Waypoint[]): string {
  return waypoints.map((w) => `${w.lat}, ${w.lng}`).join("\n");
}

/** Demo path (Dar es Salaam area) — pre-filled when adding a route. */
export const SAMPLE_ROUTE_WAYPOINTS: Waypoint[] = [
  { lat: -6.7924, lng: 39.2083, label: "Start" },
  { lat: -6.8012, lng: 39.2284 },
  { lat: -6.8156, lng: 39.2521 },
  { lat: -6.8234, lng: 39.2695, label: "End" },
];

export function defaultRouteName(existingCount: number): string {
  return `Route ${existingCount + 1}`;
}

export function buildRouteDefaults(existingCount: number, waypoints = SAMPLE_ROUTE_WAYPOINTS) {
  return {
    name: defaultRouteName(existingCount),
    description: "Main fleet corridor",
    waypoints: waypointsToText(waypoints),
    corridor_radius_m: "500",
    drawnPoints: waypoints,
  };
}
