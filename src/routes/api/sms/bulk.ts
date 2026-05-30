import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthError, requireFleetManager } from "@/lib/server-auth.server";
import { sendBulkSms } from "@/lib/sms.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Body = z.object({
  message: z.string().min(1).max(480),
  driverIds: z.array(z.string().uuid()).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/sms/bulk")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          await requireFleetManager(request.headers.get("Authorization"));

          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) {
            return json({ ok: false, error: "Invalid body" }, 400);
          }

          let query = supabaseAdmin.from("drivers").select("id, phone, full_name").not("phone", "is", null);
          if (parsed.data.driverIds?.length) {
            query = query.in("id", parsed.data.driverIds);
          }

          const { data: drivers, error } = await query;
          if (error) return json({ ok: false, error: error.message }, 500);

          const phones = (drivers ?? []).map((d) => d.phone!).filter(Boolean);
          if (phones.length === 0) {
            return json({ ok: false, error: "No drivers with phone numbers" }, 400);
          }

          const result = await sendBulkSms(phones, parsed.data.message);

          for (const d of drivers ?? []) {
            const phone = d.phone!;
            const match = result.results.find((r) => r.phone === phone || normalizeMatch(r.phone, phone));
            await supabaseAdmin.from("sms_logs").insert({
              driver_id: d.id,
              phone,
              message: parsed.data.message,
              status: match?.ok ? "sent" : "failed",
              provider_response: { bulk: true, error: match?.error },
            });
          }

          return json({ ...result, total: phones.length }, 200);
        } catch (err) {
          if (err instanceof AuthError) {
            return json({ ok: false, error: err.message }, err.status);
          }
          console.error("[Bulk SMS]", err);
          return json({ ok: false, error: "Bulk send failed" }, 500);
        }
      },
    },
  },
});

function normalizeMatch(a: string, b: string) {
  return a.replace(/\s/g, "") === b.replace(/\s/g, "") || a.endsWith(b.slice(-9));
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
