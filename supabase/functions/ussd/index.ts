// EcoTrack USSD — Africa's Talking callback
// Deploy: supabase functions deploy ussd --project-ref bogcdyhtwgzlrbsswoxf
// URL: https://bogcdyhtwgzlrbsswoxf.supabase.co/functions/v1/ussd

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+255${p.slice(1)}`;
  if (p.startsWith("255")) return `+${p}`;
  return `+${p}`;
}

function steps(text: string | undefined): string[] {
  if (!text || String(text).trim() === "") return [];
  return String(text).split("*");
}

function fmtScheduleLine(s: { title: string; scheduled_at: string; location: string | null }): string {
  const d = new Date(s.scheduled_at);
  const when = `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const loc = s.location ? ` ${s.location.slice(0, 15)}` : "";
  return `${s.title.slice(0, 22)} ${when}${loc}`;
}

async function findDriver(supabase: ReturnType<typeof createClient>, phoneNumber: string) {
  const normalized = normalizePhone(phoneNumber);
  const { data: drivers } = await supabase.from("drivers").select("id, full_name, phone");
  return (
    drivers?.find((d) => {
      const p = normalizePhone(d.phone ?? "");
      if (!p || !normalized) return false;
      return p === normalized || p.endsWith(normalized.replace("+", "")) || normalized.endsWith(p.replace("+", ""));
    }) ?? null
  );
}

async function notifyAdmins(
  supabase: ReturnType<typeof createClient>,
  driverName: string,
  message: string
) {
  const { data: managers } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "fleet_manager"]);

  for (const m of managers ?? []) {
    await supabase.from("notifications").insert({
      user_id: m.user_id,
      title: `Driver report — ${driverName}`,
      body: message.slice(0, 200),
    });
  }
}

async function handleUssd(
  supabase: ReturnType<typeof createClient>,
  phoneNumber: string,
  text: string | undefined
): Promise<string> {
  const driver = await findDriver(supabase, phoneNumber);
  if (!driver) return "END Phone not registered. Contact fleet admin.";

  const s = steps(text);
  const ussdCode = Deno.env.get("AT_USSD_CODE");
  const dialHint = ussdCode ? `\nDial: ${ussdCode}` : "";

  if (s.length === 0) {
    return `CON EcoTrack Driver${dialHint}\n1. My schedule\n2. Report to admin\n0. Exit`;
  }

  if (s[0] === "0") return "END Goodbye.";

  if (s[0] === "1" && s.length === 1) {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: schedules } = await supabase
      .from("driver_schedules")
      .select("title, scheduled_at, location")
      .eq("driver_id", driver.id)
      .eq("status", "scheduled")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", weekAhead.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(4);

    if (!schedules?.length) return "END No upcoming trips in the next 7 days.";

    let msg = "END Your schedule:\n";
    schedules.forEach((sch, i) => {
      msg += `${i + 1}. ${fmtScheduleLine(sch)}\n`;
    });
    return msg.trim();
  }

  if (s[0] === "2" && s.length === 1) {
    return "CON Type your report:\ndelay, issue, location.\nPress Send when done.";
  }

  if (s[0] === "2" && s.length >= 2) {
    const reportText = s.slice(1).join("*").trim();
    if (!reportText) return "END Report empty. Dial again.";

    const { error } = await supabase.from("driver_reports").insert({
      driver_id: driver.id,
      phone_number: normalizePhone(phoneNumber) ?? phoneNumber,
      message: reportText.slice(0, 500),
      source: "ussd",
      status: "open",
    });

    if (error) return "END Could not save. Try later.";

    await notifyAdmins(supabase, driver.full_name, reportText);
    return "END Report sent to admin. Thank you.";
  }

  return "END Invalid option. Dial again.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let body: Record<string, string> = {};
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => { body[k] = String(v); });
    }

    console.log("[USSD]", body);

    const response = await handleUssd(supabase, body.phoneNumber ?? "", body.text);

    return new Response(response, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (e) {
    console.error("[USSD]", e);
    return new Response("END System error. Try again.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
