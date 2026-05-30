/**
 * Africa's Talking SMS API (server-only).
 * Docs: https://developers.africastalking.com/docs/sms/overview
 *
 * Env: AT_USERNAME, AT_API_KEY
 * Optional: AT_FROM_SHORTCODE (live/production sender ID)
 */

const AT_MESSAGING_URL = "https://api.africastalking.com/version1/messaging";

export type SmsResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
  messageId?: string;
  status?: string;
};

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const username = process.env.AT_USERNAME || "sandbox";
  const apiKey = process.env.AT_API_KEY;

  if (!apiKey) {
    console.warn("[AT SMS] AT_API_KEY not set — skipping send");
    return { ok: false, error: "SMS not configured (set AT_API_KEY in .env)" };
  }

  const to = normalizePhone(phone);
  if (!to) return { ok: false, error: "Invalid phone number" };

  const isSandbox = username === "sandbox";
  const body = new URLSearchParams({ username, to, message });

  // Live apps need a sender ID / shortcode; sandbox uses defaults
  if (!isSandbox && process.env.AT_FROM_SHORTCODE) {
    body.append("from", process.env.AT_FROM_SHORTCODE);
  }

  try {
    const res = await fetch(AT_MESSAGING_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
      },
      body: body.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as AtMessagingResponse;

    if (!res.ok) {
      console.error("[AT SMS] API error", data);
      return { ok: false, error: data?.SMSMessageData?.Message ?? JSON.stringify(data), data };
    }

    const recipient = data?.SMSMessageData?.Recipients?.[0];
    const status = recipient?.status ?? "Unknown";

    console.log("[AT SMS] sent", {
      to,
      status,
      messageId: recipient?.messageId,
      cost: recipient?.cost,
    });

    if (status === "Failed" || Number(recipient?.statusCode) >= 400) {
      return {
        ok: false,
        error: recipient?.status ?? "Send failed",
        data,
        messageId: recipient?.messageId,
        status,
      };
    }

    return {
      ok: true,
      data,
      messageId: recipient?.messageId,
      status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMS send failed";
    console.error("[AT SMS]", msg);
    return { ok: false, error: msg };
  }
}

export function normalizePhone(phone: string): string | null {
  const p = phone.trim().replace(/\s/g, "");
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+255${p.slice(1)}`;
  if (p.startsWith("255")) return `+${p}`;
  return `+${p}`;
}

export type BulkSmsResult = {
  ok: boolean;
  sent: number;
  failed: number;
  results: Array<{ phone: string; ok: boolean; error?: string }>;
};

/** Send same message to multiple numbers (Africa's Talking bulk). */
export async function sendBulkSms(phones: string[], message: string): Promise<BulkSmsResult> {
  const unique = [...new Set(phones.map(normalizePhone).filter(Boolean))] as string[];
  if (unique.length === 0) {
    return { ok: false, sent: 0, failed: 0, results: [] };
  }

  const username = process.env.AT_USERNAME || "sandbox";
  const apiKey = process.env.AT_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      sent: 0,
      failed: unique.length,
      results: unique.map((phone) => ({ phone, ok: false, error: "SMS not configured" })),
    };
  }

  const isSandbox = username === "sandbox";
  const body = new URLSearchParams({
    username,
    to: unique.join(","),
    message,
  });
  if (!isSandbox && process.env.AT_FROM_SHORTCODE) {
    body.append("from", process.env.AT_FROM_SHORTCODE);
  }

  try {
    const res = await fetch(AT_MESSAGING_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
      },
      body: body.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as AtMessagingResponse;
    const recipients = data?.SMSMessageData?.Recipients ?? [];

    const results = unique.map((phone) => {
      const r = recipients.find((x) => x.number?.includes(phone.replace("+", "")) || x.number === phone);
      const ok = r?.status !== "Failed" && Number(r?.statusCode ?? 0) < 400;
      return { phone, ok, error: ok ? undefined : r?.status ?? "Failed" };
    });

    const sent = results.filter((r) => r.ok).length;
    return { ok: sent > 0, sent, failed: results.length - sent, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bulk SMS failed";
    return {
      ok: false,
      sent: 0,
      failed: unique.length,
      results: unique.map((phone) => ({ phone, ok: false, error: msg })),
    };
  }
}

type AtMessagingResponse = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: Array<{
      status?: string;
      statusCode?: number;
      messageId?: string;
      cost?: string;
      number?: string;
    }>;
  };
};
