import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { distanceToRouteMeters, type Waypoint } from "@/lib/route-geo";
import { notifyDriverForAlert } from "@/lib/notify-driver.server";

const OFF_ROUTE_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min between alerts

/** Check live GPS against active schedule route; update status + alert if off-route. */
export async function checkRouteCompliance(
  vehicleId: string | null,
  latitude: number,
  longitude: number
) {
  if (!vehicleId) return;

  const { data: driver } = await supabaseAdmin
    .from("drivers")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (!driver) return;

  const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const { data: schedule } = await supabaseAdmin
    .from("driver_schedules")
    .select("id, route_id, route_status, off_route_count, last_route_check_at, routes(name, waypoints, corridor_radius_m)")
    .eq("driver_id", driver.id)
    .eq("status", "scheduled")
    .not("route_id", "is", null)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", windowEnd)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!schedule?.route_id) return;

  const route = schedule.routes as {
    name: string;
    waypoints: Waypoint[];
    corridor_radius_m: number;
  } | null;

  if (!route?.waypoints?.length) return;

  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const radius = route.corridor_radius_m ?? 500;
  const dist = distanceToRouteMeters(latitude, longitude, waypoints);
  const onRoute = dist <= radius;
  const newStatus = onRoute ? "on_route" : "off_route";

  const prevStatus = schedule.route_status;
  const offCount = (schedule.off_route_count ?? 0) + (onRoute ? 0 : 1);

  await supabaseAdmin
    .from("driver_schedules")
    .update({
      route_status: newStatus,
      last_route_check_at: new Date().toISOString(),
      off_route_count: offCount,
    })
    .eq("id", schedule.id);

  if (!onRoute && prevStatus !== "off_route") {
    const lastCheck = schedule.last_route_check_at
      ? new Date(schedule.last_route_check_at).getTime()
      : 0;
    if (Date.now() - lastCheck < OFF_ROUTE_ALERT_COOLDOWN_MS) return;

    const msg = `Off route on "${route.name}" (${Math.round(dist)}m from corridor)`;
    const { data: alertRow } = await supabaseAdmin
      .from("alerts")
      .insert({
        vehicle_id: vehicleId,
        type: "off_route",
        severity: "warning",
        message: msg,
        status: "open",
        metadata: { schedule_id: schedule.id, distance_m: dist, route_name: route.name },
      })
      .select("id")
      .single();

    if (alertRow?.id) {
      notifyDriverForAlert(vehicleId, alertRow.id, msg, "warning").catch(console.error);
    }
  }

  if (onRoute && prevStatus === "off_route") {
    console.log("[Route] Back on route", schedule.id);
  }
}
