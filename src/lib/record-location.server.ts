import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkRouteCompliance } from "@/lib/check-route.server";

export type LocationPayload = {
  latitude: number;
  longitude: number;
  speed?: number;
  accuracy_m?: number;
};

/** Save phone GPS and run route compliance (no IoT device needed). */
export async function recordDriverLocation(driverId: string, vehicleId: string | null, payload: LocationPayload) {
  const { latitude, longitude, speed, accuracy_m } = payload;

  await supabaseAdmin.from("driver_location_pings").insert({
    driver_id: driverId,
    vehicle_id: vehicleId,
    latitude,
    longitude,
    speed: speed ?? null,
    accuracy_m: accuracy_m ?? null,
    source: "browser",
  });

  if (vehicleId) {
    await checkRouteCompliance(vehicleId, latitude, longitude);
  }
}
