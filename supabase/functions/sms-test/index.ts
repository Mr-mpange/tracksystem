// Deploy: supabase functions deploy sms-test --project-ref bogcdyhtwgzlrbsswoxf
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

async function requireFleetManager(admin: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error("Invalid session");
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "fleet_manager");
  if (!ok) throw new Error("Fleet manager access required");
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

    const { phone, message } = await req.json();
    const to = normalizePhone(phone ?? "");
    if (!to) return json({ ok: false, error: "Invalid phone number" }, 400);

    const username = Deno.env.get("AT_USERNAME") || "sandbox";
    const apiKey = Deno.env.get("AT_API_KEY");
    if (!apiKey) return json({ ok: false, error: "AT_API_KEY not set in Supabase Edge secrets" }, 500);

    const body = new URLSearchParams({
      username,
      to,
      message: message?.trim() || "EcoTrack test SMS",
    });

    const messagingUrl =
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";

    const res = await fetch(messagingUrl, {
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
    const status = recipient?.status ?? "Unknown";
    const ok =
      res.ok && status !== "Failed" && Number(recipient?.statusCode ?? 0) < 400;

    return json({
      ok,
      phone: to,
      username,
      isSandbox: username === "sandbox",
      atMessage: data?.SMSMessageData?.Message,
      status,
      messageId: recipient?.messageId,
      cost: recipient?.cost,
      simulatorUrl: "https://simulator.africastalking.com:1517/",
      outboxUrl: "https://account.africastalking.com/apps/sandbox/sms/outbox",
      sandboxNote:
        username === "sandbox"
          ? `Register ${to} on the AT Simulator (link above), then send again. Messages appear in the Simulator inbox and Sandbox Outbox — not on a real handset.`
          : null,
      error: ok ? undefined : data?.SMSMessageData?.Message ?? status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Test failed";
    return json({ ok: false, error: msg }, 500);
  }
});
