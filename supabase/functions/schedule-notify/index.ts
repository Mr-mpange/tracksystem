// Deploy: supabase functions deploy schedule-notify --project-ref bogcdyhtwgzlrbsswoxf
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+255${p.slice(1)}`;
  if (p.startsWith("255")) return `+${p}`;
  return `+${p}`;
}

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

async function requireFleetManager(admin: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error("Invalid session");
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "fleet_manager");
  if (!ok) throw new Error("Fleet manager access required");
}

async function sendSms(phone: string, message: string) {
  const username = Deno.env.get("AT_USERNAME") || "sandbox";
  const apiKey = Deno.env.get("AT_API_KEY");
  const to = normalizePhone(phone);
  if (!apiKey || !to) return { ok: false, error: "SMS not configured" };

  const body = new URLSearchParams({ username, to, message });
  if (username !== "sandbox" && Deno.env.get("AT_FROM_SHORTCODE")) {
    body.append("from", Deno.env.get("AT_FROM_SHORTCODE")!);
  }

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey,
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  const ok = recipient?.status !== "Failed" && Number(recipient?.statusCode ?? 0) < 400;
  return { ok, data, error: ok ? undefined : recipient?.status ?? "Failed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    await requireFleetManager(admin, req.headers.get("Authorization"));

    const { scheduleId, type } = await req.json();
    if (!scheduleId || !type) return json({ ok: false, error: "scheduleId and type required" }, 400);

    if (type === "created") {
      const { data: row } = await admin
        .from("driver_schedules")
        .select("id, title, scheduled_at, location, driver_id, routes(name), drivers(id, full_name, phone, user_id)")
        .eq("id", scheduleId)
        .maybeSingle();

      if (!row) return json({ ok: false, error: "Schedule not found" }, 404);
      const driver = row.drivers as { id: string; phone: string | null; user_id: string | null } | null;
      if (!driver?.phone) return json({ ok: false, error: "Driver has no phone for SMS" }, 400);

      const when = formatWhen(row.scheduled_at);
      const loc = row.location ? ` @ ${row.location}` : "";
      const ussd = Deno.env.get("AT_USSD_CODE") ?? "";
      const ussdHint = ussd ? ` Dial ${ussd} → 1 to view.` : " Dial USSD → 1 to view.";
      const routeName = (row.routes as { name?: string } | null)?.name;
      const routePart = routeName ? ` Route: ${routeName}.` : "";
      const smsBody = `EcoTrack schedule: ${row.title}${loc} on ${when}.${routePart}${ussdHint}`;

      const smsResult = await sendSms(driver.phone, smsBody);
      await admin.from("sms_logs").insert({
        driver_id: driver.id,
        phone: driver.phone,
        message: smsBody,
        status: smsResult.ok ? "sent" : "failed",
        provider_response: smsResult.data ?? { error: smsResult.error },
      });

      if (driver.user_id) {
        await admin.from("notifications").insert({
          user_id: driver.user_id,
          title: `New trip — ${row.title}`,
          body: `${when}${loc ? ` · ${row.location}` : ""}`,
          alert_id: null,
        });
      }

      return json({ ok: smsResult.ok, smsSent: smsResult.ok, error: smsResult.error });
    }

    const { data: row } = await admin
      .from("driver_schedules")
      .select("id, title, scheduled_at, drivers(id, phone, user_id)")
      .eq("id", scheduleId)
      .maybeSingle();

    if (!row) return json({ ok: false, error: "Schedule not found" }, 404);
    const driver = row.drivers as { id: string; phone: string | null; user_id: string | null } | null;
    if (!driver?.phone) return json({ ok: false, error: "Driver has no phone" }, 400);

    const when = formatWhen(row.scheduled_at);
    const smsBody = `EcoTrack: Trip "${row.title}" on ${when} has been CANCELLED.`;
    const smsResult = await sendSms(driver.phone, smsBody);

    await admin.from("sms_logs").insert({
      driver_id: driver.id,
      phone: driver.phone,
      message: smsBody,
      status: smsResult.ok ? "sent" : "failed",
      provider_response: smsResult.data ?? { error: smsResult.error },
    });

    if (driver.user_id) {
      await admin.from("notifications").insert({
        user_id: driver.user_id,
        title: `Trip cancelled — ${row.title}`,
        body: `Was scheduled for ${when}`,
        alert_id: null,
      });
    }

    return json({ ok: smsResult.ok, smsSent: smsResult.ok });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Notification failed";
    return json({ ok: false, error: msg }, 500);
  }
});
