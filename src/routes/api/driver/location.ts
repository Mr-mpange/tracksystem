import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordDriverLocation } from "@/lib/record-location.server";

const Body = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(500).optional(),
  accuracy_m: z.number().min(0).optional(),
});

export const Route = createFileRoute("/api/driver/location")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ ok: false, error: "Unauthorized" }, 401);
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !user) return json({ ok: false, error: "Invalid session" }, 401);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: "Invalid body" }, 400);

        const { data: driver } = await supabaseAdmin
          .from("drivers")
          .select("id, vehicle_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!driver) {
          return json({ ok: false, error: "No driver profile linked to this account" }, 403);
        }

        await recordDriverLocation(driver.id, driver.vehicle_id, parsed.data);

        return json({ ok: true, vehicle_id: driver.vehicle_id }, 200);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
