import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSms } from "@/lib/sms.server";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function logSms(driverId: string, phone: string, message: string, ok: boolean, data: unknown) {
  await supabaseAdmin.from("sms_logs").insert({
    driver_id: driverId,
    phone,
    message,
    status: ok ? "sent" : "failed",
    provider_response: JSON.parse(JSON.stringify(data ?? {})),
  });
}

/** SMS + in-app notification when admin assigns a new trip. */
export async function notifyDriverScheduleCreated(scheduleId: string) {
  const { data: row } = await supabaseAdmin
    .from("driver_schedules")
    .select("id, title, scheduled_at, location, driver_id, routes(name), drivers(id, full_name, phone, user_id)")
    .eq("id", scheduleId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Schedule not found" };

  const driver = row.drivers as {
    id: string;
    full_name: string;
    phone: string | null;
    user_id: string | null;
  } | null;

  if (!driver?.phone) {
    return { ok: false, error: "Driver has no phone for SMS" };
  }

  const when = formatWhen(row.scheduled_at);
  const loc = row.location ? ` @ ${row.location}` : "";
  const ussd = process.env.AT_USSD_CODE ?? process.env.VITE_AT_USSD_CODE;
  const ussdHint = ussd ? ` Dial ${ussd} → 1 to view.` : " Dial USSD → 1 to view.";

  const routeName = (row.routes as { name?: string } | null)?.name;
  const routePart = routeName ? ` Route: ${routeName}.` : "";
  const smsBody = `EcoTrack schedule: ${row.title}${loc} on ${when}.${routePart}${ussdHint}`;

  const smsResult = await sendSms(driver.phone, smsBody);
  await logSms(driver.id, driver.phone, smsBody, smsResult.ok, smsResult.data ?? { error: smsResult.error });

  if (driver.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: driver.user_id,
      title: `New trip — ${row.title}`,
      body: `${when}${loc ? ` · ${row.location}` : ""}`,
      alert_id: null,
    });
  }

  return { ok: smsResult.ok, smsSent: smsResult.ok, error: smsResult.error };
}

/** SMS when a scheduled trip is cancelled. */
export async function notifyDriverScheduleCancelled(scheduleId: string) {
  const { data: row } = await supabaseAdmin
    .from("driver_schedules")
    .select("id, title, scheduled_at, drivers(id, full_name, phone, user_id)")
    .eq("id", scheduleId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Schedule not found" };

  const driver = row.drivers as {
    id: string;
    phone: string | null;
    user_id: string | null;
  } | null;

  if (!driver?.phone) return { ok: false, error: "Driver has no phone" };

  const when = formatWhen(row.scheduled_at);
  const smsBody = `EcoTrack: Trip "${row.title}" on ${when} has been CANCELLED.`;

  const smsResult = await sendSms(driver.phone, smsBody);
  await logSms(driver.id, driver.phone, smsBody, smsResult.ok, smsResult.data ?? { error: smsResult.error });

  if (driver.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: driver.user_id,
      title: `Trip cancelled — ${row.title}`,
      body: `Was scheduled for ${when}`,
      alert_id: null,
    });
  }

  return { ok: smsResult.ok, smsSent: smsResult.ok };
}
