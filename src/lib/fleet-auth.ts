import { supabase } from "@/integrations/supabase/client";

export type FleetRole = "super_admin" | "fleet_manager" | "operator" | "driver";

export type FleetContext = {
  role: FleetRole | null;
  isAdmin: boolean;
  isDriver: boolean;
  driverId: string | null;
  vehicleId: string | null;
};

export async function getFleetContext(): Promise<FleetContext> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { role: null, isAdmin: false, isDriver: false, driverId: null, vehicleId: null };
  }

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roleList = (roles ?? []).map((r) => r.role as FleetRole);
  const role = roleList.includes("super_admin")
    ? "super_admin"
    : roleList.includes("fleet_manager")
      ? "fleet_manager"
      : roleList.includes("driver")
        ? "driver"
        : roleList[0] ?? "operator";

  const isAdmin = role === "super_admin" || role === "fleet_manager";
  const isDriver = role === "driver";

  let driverId: string | null = null;
  let vehicleId: string | null = null;

  if (isDriver) {
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, vehicle_id")
      .eq("user_id", user.id)
      .maybeSingle();
    driverId = driver?.id ?? null;
    vehicleId = driver?.vehicle_id ?? null;
  }

  return { role, isAdmin, isDriver, driverId, vehicleId };
}

export const adminOnlyPaths = ["/dashboard", "/vehicles", "/drivers", "/devices", "/reports"];
