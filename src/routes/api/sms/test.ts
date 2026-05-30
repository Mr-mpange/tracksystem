import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendSms } from "@/lib/sms.server";

const Body = z.object({
  phone: z.string().min(8),
  message: z.string().min(1).max(480),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** POST /api/sms/test — send a test SMS via Africa's Talking (dev/admin). */
export const Route = createFileRoute("/api/sms/test")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
        }

        const result = await sendSms(parsed.data.phone, parsed.data.message);
        return json(result, result.ok ? 200 : 502);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
