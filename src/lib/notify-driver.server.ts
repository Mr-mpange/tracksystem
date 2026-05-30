import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms } from "@/lib/sms.server";

/** Notify assigned driver by SMS + in-app notification when an alert fires. */
export async function notifyDriverForAlert(
  vehicleId: string | null,
  alertId: string,
  message: string,
  severity: string
) {
  if (!vehicleId) return;

  const { data: driver } = await supabaseAdmin
    .from("drivers")
    .select("id, full_name, phone, user_id, vehicles(plate_number)")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (!driver?.phone) {
    console.warn("[Notify] No driver phone for vehicle", vehicleId);
    return;
  }

  const plate = (driver.vehicles as { plate_number?: string } | null)?.plate_number ?? "your vehicle";
  const smsBody = `EcoTrack [${severity.toUpperCase()}] ${plate}: ${message}`;

  const smsResult = await sendSms(driver.phone, smsBody);

  const providerResponse = JSON.parse(
    JSON.stringify(smsResult.data ?? { error: smsResult.error ?? "unknown" })
  );

  await supabaseAdmin.from("sms_logs").insert({
    driver_id: driver.id,
    phone: driver.phone,
    message: smsBody,
    alert_id: alertId,
    status: smsResult.ok ? "sent" : "failed",
    provider_response: providerResponse,
  });

  if (driver.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: driver.user_id,
      title: `Fleet alert — ${plate}`,
      body: message,
      alert_id: alertId,
    });
  }

  // Notify fleet managers
  const { data: managers } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "fleet_manager"]);

  for (const m of managers ?? []) {
    if (m.user_id === driver.user_id) continue;
    await supabaseAdmin.from("notifications").insert({
      user_id: m.user_id,
      title: `Alert — ${plate}`,
      body: message,
      alert_id: alertId,
    });
  }
}
