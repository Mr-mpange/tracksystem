import { createFileRoute } from "@tanstack/react-router";
import { handleUssdRequest } from "@/lib/ussd.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** POST /api/public/ussd — Africa's Talking USSD callback */
export const Route = createFileRoute("/api/public/ussd")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: Record<string, string> = {};
        const contentType = request.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          body = (await request.json().catch(() => ({}))) as Record<string, string>;
        } else {
          const form = await request.formData().catch(() => null);
          if (form) {
            form.forEach((v, k) => { body[k] = String(v); });
          }
        }

        console.log("[USSD]", body);

        const response = await handleUssdRequest({
          sessionId: body.sessionId,
          phoneNumber: body.phoneNumber,
          text: body.text,
        });

        return new Response(response, {
          status: 200,
          headers: { "Content-Type": "text/plain", ...cors },
        });
      },
    },
  },
});
