import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePhone } from "@/lib/sms.server";

function steps(text: string | undefined): string[] {
  if (!text || String(text).trim() === "") return [];
  return String(text).split("*");
}

function fmtScheduleLine(s: { title: string; scheduled_at: string; location: string | null }): string {
  const d = new Date(s.scheduled_at);
  const when = `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const loc = s.location ? ` @ ${s.location.slice(0, 20)}` : "";
  return `${s.title.slice(0, 28)} ${when}${loc}`;
}

async function findDriverByPhone(phoneNumber: string) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return null;

  const variants = [normalized, normalized.replace("+", ""), phoneNumber.trim()];

  const { data: drivers } = await supabaseAdmin.from("drivers").select("id, full_name, phone");

  return (
    drivers?.find((d) => {
      const p = normalizePhone(d.phone ?? "");
      return p && variants.some((v) => p === normalizePhone(v) || p.endsWith(v.replace("+", "")));
    }) ?? null
  );
}

async function notifyAdminsReport(driverName: string, message: string, reportId: string) {
  const { data: managers } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "fleet_manager"]);

  for (const m of managers ?? []) {
    await supabaseAdmin.from("notifications").insert({
      user_id: m.user_id,
      title: `Driver report — ${driverName}`,
      body: message.slice(0, 200),
      alert_id: null,
    });
  }

  // Optional: SMS fleet managers with phone in profiles - skip for now
  console.log("[USSD] Report saved", reportId);
}

export async function handleUssdRequest(body: {
  sessionId?: string;
  phoneNumber?: string;
  text?: string;
}): Promise<string> {
  const phoneNumber = body.phoneNumber ?? "";
  const s = steps(body.text);

  const driver = await findDriverByPhone(phoneNumber);
  if (!driver) {
    return "END Phone not registered. Contact fleet admin.";
  }

  const ussdCode = process.env.AT_USSD_CODE;
  const dialHint = ussdCode ? `\nDial: ${ussdCode}` : "";

  // Main menu
  if (s.length === 0) {
    return `CON EcoTrack Driver${dialHint}\n1. My schedule\n2. Report to admin\n0. Exit`;
  }

  if (s[0] === "0") {
    return "END Goodbye.";
  }

  // Schedule
  if (s[0] === "1" && s.length === 1) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: schedules } = await supabaseAdmin
      .from("driver_schedules")
      .select("title, scheduled_at, location, status")
      .eq("driver_id", driver.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", weekAhead.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(4);

    if (!schedules?.length) {
      return "END No upcoming trips in the next 7 days.";
    }

    let msg = "END Your schedule:\n";
    schedules.forEach((sch, i) => {
      msg += `${i + 1}. ${fmtScheduleLine(sch)}\n`;
    });
    return msg.trim();
  }

  // Report — step 1: prompt
  if (s[0] === "2" && s.length === 1) {
    return "CON Type your report (delay, issue, location):\nThen press Send.";
  }

  // Report — step 2: save message (text = 2*message)
  if (s[0] === "2" && s.length >= 2) {
    const reportText = s.slice(1).join("*").trim();
    if (!reportText) {
      return "END Report empty. Dial again to retry.";
    }

    const { data: report, error } = await supabaseAdmin
      .from("driver_reports")
      .insert({
        driver_id: driver.id,
        phone_number: normalizePhone(phoneNumber) ?? phoneNumber,
        message: reportText.slice(0, 500),
        source: "ussd",
        status: "open",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[USSD] report insert", error);
      return "END Could not save report. Try again later.";
    }

    await notifyAdminsReport(driver.full_name, reportText, report.id);
    return "END Report sent to admin. Thank you.";
  }

  return "END Invalid option. Dial again.";
}
