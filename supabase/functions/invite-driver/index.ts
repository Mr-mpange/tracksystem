// Deploy: supabase functions deploy invite-driver --project-ref bogcdyhtwgzlrbsswoxf
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

async function requireFleetManager(admin: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error("Invalid session");

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r) => r.role === "super_admin" || r.role === "fleet_manager");
  if (!ok) throw new Error("Fleet manager access required");
  return user;
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

    const { driverId, siteUrl } = await req.json();
    if (!driverId) return json({ ok: false, error: "driverId required" }, 400);

    const { data: driver, error: driverErr } = await admin
      .from("drivers")
      .select("id, full_name, email, user_id")
      .eq("id", driverId)
      .maybeSingle();

    if (driverErr || !driver) return json({ ok: false, error: "Driver not found" }, 404);
    if (!driver.email?.trim()) return json({ ok: false, error: "Driver has no email" }, 400);
    if (driver.user_id) return json({ ok: false, error: "Driver already has an account" }, 400);

    const email = driver.email.trim().toLowerCase();
    const base = (siteUrl || "https://mr-mpange.github.io/tracksystem").replace(/\/$/, "");
    const redirectTo = `${base}/accept-invite`;
    const meta = { full_name: driver.full_name, role: "driver" };

    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: meta,
    });

    const emailSent = !inviteErr;
    const emailError = inviteErr?.message ?? null;
    let userId = inviteData?.user?.id;

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: meta },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return json({
        ok: false,
        error: linkErr?.message ?? inviteErr?.message ?? "Failed to generate invite link",
      }, 400);
    }

    userId = userId ?? linkData.user?.id;
    if (userId) {
      await admin.from("drivers").update({ user_id: userId }).eq("id", driver.id);
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("user_roles").insert({ user_id: userId, role: "driver" });
    }

    await admin.from("drivers").update({ invited_at: new Date().toISOString() }).eq("id", driver.id);

    return json({
      ok: true,
      email,
      inviteLink: linkData.properties.action_link,
      emailSent,
      emailError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invite failed";
    const status = msg.includes("Unauthorized") || msg.includes("session") ? 401 : msg.includes("manager") ? 403 : 500;
    return json({ ok: false, error: msg }, status);
  }
});
