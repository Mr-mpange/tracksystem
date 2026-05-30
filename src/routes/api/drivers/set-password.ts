import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthError, requireFleetManager } from "@/lib/server-auth.server";
import { setDriverPassword } from "@/lib/set-driver-password.server";

const Body = z.object({
  driverId: z.string().uuid(),
  password: z.string().min(6).max(128),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/drivers/set-password")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          await requireFleetManager(request.headers.get("Authorization"));
          const parsed = Body.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return json({ ok: false, error: "Invalid body" }, 400);

          const result = await setDriverPassword(parsed.data.driverId, parsed.data.password);
          return json(result, result.ok ? 200 : 400);
        } catch (err) {
          if (err instanceof AuthError) return json({ ok: false, error: err.message }, err.status);
          return json({ ok: false, error: "Failed to set password" }, 500);
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
