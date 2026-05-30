import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthError, requireFleetManager } from "@/lib/server-auth.server";
import { inviteDriver } from "@/lib/invite-driver.server";

const Body = z.object({
  driverId: z.string().uuid(),
  siteUrl: z.string().url().optional(),
  sendEmail: z.boolean().optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/drivers/invite")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          await requireFleetManager(request.headers.get("Authorization"));

          let raw: unknown;
          try {
            raw = await request.json();
          } catch {
            return json({ ok: false, error: "Invalid JSON" }, 400);
          }

          const parsed = Body.safeParse(raw);
          if (!parsed.success) {
            return json({ ok: false, error: "Invalid body" }, 400);
          }

          const siteUrl =
            parsed.data.siteUrl ||
            process.env.SITE_URL ||
            process.env.VITE_SITE_URL ||
            "https://mr-mpange.github.io/tracksystem";

          const result = await inviteDriver(
            parsed.data.driverId,
            siteUrl,
            parsed.data.sendEmail === true
          );
          return json(result, result.ok ? 200 : 400);
        } catch (err) {
          if (err instanceof AuthError) {
            return json({ ok: false, error: err.message }, err.status);
          }
          console.error("[Invite API]", err);
          return json({ ok: false, error: "Invite failed" }, 500);
        }
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
