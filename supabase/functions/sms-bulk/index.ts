// Deploy: supabase functions deploy sms-bulk --project-ref bogcdyhtwgzlrbsswoxf
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

function matchRecipient(
  recipients: Array<{ number?: string; status?: string; statusCode?: number; messageId?: string }>,
  phone: string
) {
  const digits = phone.replace(/\D/g, "");
  return recipients.find((x) => {
    const n = (x.number ?? "").replace(/\D/g, "");
    return n === digits || n.endsWith(digits.slice(-9)) || digits.endsWith(n.slice(-9));
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

async function sendBulkSms(phones: string[], message: string) {
  const username = Deno.env.get("AT_USERNAME") || "sandbox";
  const apiKey = Deno.env.get("AT_API_KEY");
  const unique = [...new Set(phones.map(normalizePhone).filter(Boolean))] as string[];

  if (!apiKey) {
    return {
      ok: false,
      sent: 0,
      failed: unique.length,
      error: "AT_API_KEY not set in Supabase → Edge Functions → Secrets",
      isSandbox: username === "sandbox",
      results: unique.map((phone) => ({ phone, ok: false, error: "SMS not configured" })),
    };
  }

  const body = new URLSearchParams({ username, to: unique.join(","), message });
  if (username !== "sandbox" && Deno.env.get("AT_FROM_SHORTCODE")) {
    body.append("from", Deno.env.get("AT_FROM_SHORTCODE")!);
  }

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
  const atMessage = data?.SMSMessageData?.Message as string | undefined;
  const recipients = (data?.SMSMessageData?.Recipients ?? []) as Array<{
    number?: string;
    status?: string;
    statusCode?: number;
    messageId?: string;
  }>;

  if (!res.ok) {
    return {
      ok: false,
      sent: 0,
      failed: unique.length,
      error: atMessage ?? `Africa's Talking HTTP ${res.status}`,
      isSandbox: username === "sandbox",
      atMessage,
      results: unique.map((phone) => ({ phone, ok: false, error: atMessage })),
    };
  }

  const results = unique.map((phone) => {
    const r = matchRecipient(recipients, phone);
    const ok = r?.status !== "Failed" && Number(r?.statusCode ?? 0) < 400;
    return {
      phone,
      ok,
      status: r?.status,
      messageId: r?.messageId,
      error: ok ? undefined : r?.status ?? atMessage ?? "Failed",
    };
  });

  const sent = results.filter((r) => r.ok).length;
  return {
    ok: sent > 0,
    sent,
    failed: results.length - sent,
    isSandbox: username === "sandbox",
    atMessage,
    sandboxNote:
      username === "sandbox"
        ? "Sandbox SMS does not arrive on your phone. View Outbox in AT dashboard or use simulator.africastalking.com:1517"
        : null,
    results,
  };
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

    const { message, driverIds } = await req.json();
    if (!message?.trim()) return json({ ok: false, error: "Message required" }, 400);

    let query = admin.from("drivers").select("id, phone, full_name").not("phone", "is", null);
    if (driverIds?.length) query = query.in("id", driverIds);

    const { data: drivers, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 500);

    const phones = (drivers ?? []).map((d) => d.phone!).filter(Boolean);
    if (phones.length === 0) return json({ ok: false, error: "No drivers with phone numbers" }, 400);

    const result = await sendBulkSms(phones, message.trim());

    for (const d of drivers ?? []) {
      const phone = normalizePhone(d.phone!) ?? d.phone!;
      const match = result.results.find((r: { phone: string }) => r.phone === phone);
      await admin.from("sms_logs").insert({
        driver_id: d.id,
        phone: d.phone!,
        message: message.trim(),
        status: match?.ok ? "sent" : "failed",
        provider_response: {
          bulk: true,
          normalized: phone,
          status: match?.status,
          error: match?.error,
          atMessage: result.atMessage,
        },
      });
    }

    return json({ ...result, total: phones.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk send failed";
    return json({ ok: false, error: msg }, 500);
  }
});
