import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyDriverForAlert } from "@/lib/notify-driver.server";
import { checkRouteCompliance } from "@/lib/check-route.server";

const Payload = z.object({
  deviceId: z.string().min(1).max(128),
  temperature: z.number().min(-50).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  fuelUsed: z.number().min(0).max(10000),
  speed: z.number().min(0).max(500),
});

const TEMP_WARN = 90;
const TEMP_CRIT = 110;
const EMISSION_ALERT_KG = 50; // single-reading threshold

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/iot/data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        const parsed = Payload.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        const p = parsed.data;

        // 1. Find device + vehicle
        const { data: device, error: devErr } = await supabaseAdmin
          .from("devices").select("id, vehicle_id, vehicles(fuel_type, plate_number)")
          .eq("serial_number", p.deviceId).maybeSingle();
        if (devErr) return json({ error: devErr.message }, 500);
        if (!device) return json({ error: "Unknown device" }, 404);

        // 2. Insert sensor log
        const { error: logErr } = await supabaseAdmin.from("sensor_logs").insert({
          device_id: device.id, vehicle_id: device.vehicle_id,
          temperature: p.temperature, latitude: p.latitude, longitude: p.longitude,
          fuel_used: p.fuelUsed, speed: p.speed,
        });
        if (logErr) return json({ error: logErr.message }, 500);

        // 2b. Route compliance (schedule + assigned route)
        checkRouteCompliance(device.vehicle_id, p.latitude, p.longitude).catch(console.error);

        // 3. Update device heartbeat
        await supabaseAdmin.from("devices")
          .update({ last_seen: new Date().toISOString(), status: "online" })
          .eq("id", device.id);

        // 4. CO2 calculation
        let emissionKg = 0;
        if (device.vehicle_id && p.fuelUsed > 0) {
          const factor = (device.vehicles as any)?.fuel_type === "diesel" ? 2.68 : 2.31;
          emissionKg = p.fuelUsed * factor;
          await supabaseAdmin.from("carbon_logs").insert({
            vehicle_id: device.vehicle_id, fuel_used: p.fuelUsed, emission_kg: emissionKg,
          });
        }

        // 5. Alerts
        const alerts: Array<{ type: "high_temperature" | "high_emission"; severity: "warning" | "critical"; message: string }> = [];
        if (p.temperature >= TEMP_CRIT) alerts.push({ type: "high_temperature", severity: "critical", message: `Critical engine temperature: ${p.temperature}°C` });
        else if (p.temperature >= TEMP_WARN) alerts.push({ type: "high_temperature", severity: "warning", message: `High engine temperature: ${p.temperature}°C` });
        if (emissionKg >= EMISSION_ALERT_KG) alerts.push({ type: "high_emission", severity: "warning", message: `High CO₂ emission burst: ${emissionKg.toFixed(1)} kg` });
        for (const a of alerts) {
          const { data: alertRow } = await supabaseAdmin
            .from("alerts")
            .insert({
              vehicle_id: device.vehicle_id,
              device_id: device.id,
              type: a.type,
              severity: a.severity,
              message: a.message,
              status: "open",
            })
            .select("id")
            .single();

          if (alertRow?.id) {
            notifyDriverForAlert(device.vehicle_id, alertRow.id, a.message, a.severity).catch((e) =>
              console.error("[IoT] notify failed:", e)
            );
          }
        }

        return json({ ok: true, emissionKg, alerts: alerts.length }, 200);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}
