// Deploy: supabase functions deploy set-driver-password --project-ref bogcdyhtwgzlrbsswoxf
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
}

async function userIsFleetAdmin(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (roles ?? []).some((r) => r.role === "super_admin" || r.role === "fleet_manager");
}

async function linkDriver(
  admin: ReturnType<typeof createClient>,
  driverId: string,
  userId: string
) {
  if (await userIsFleetAdmin(admin, userId)) {
    throw new Error(
      "This email is already used by a fleet admin account. Use a different email on the driver record."
    );
  }
  await admin.from("drivers").update({ user_id: userId }).eq("id", driverId);
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("user_roles").insert({ user_id: userId, role: "driver" });
}

async function findUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  while (page <= 10) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const match = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if ((data?.users?.length ?? 0) < 200) break;
    page++;
  }
  return null;
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

    const { driverId, password } = await req.json();
    if (!driverId) return json({ ok: false, error: "driverId required" }, 400);
    if (!password || String(password).length < 6) {
      return json({ ok: false, error: "Password must be at least 6 characters" }, 400);
    }

    const { data: driver, error: driverErr } = await admin
      .from("drivers")
      .select("id, full_name, email, user_id")
      .eq("id", driverId)
      .maybeSingle();

    if (driverErr || !driver) return json({ ok: false, error: "Driver not found" }, 404);
    if (!driver.email?.trim()) return json({ ok: false, error: "Driver has no email" }, 400);

    const email = driver.email.trim().toLowerCase();
    const meta = { full_name: driver.full_name, role: "driver" };
    let userId = driver.user_id;

    if (userId) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: String(password) });
      if (error) return json({ ok: false, error: error.message }, 400);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: String(password),
        email_confirm: true,
        user_metadata: meta,
      });

      if (createErr) {
        const msg = createErr.message?.toLowerCase() ?? "";
        const exists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
        if (!exists) return json({ ok: false, error: createErr.message }, 400);

        userId = await findUserIdByEmail(admin, email);
        if (!userId) return json({ ok: false, error: "Account exists but could not be linked" }, 400);

        const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
          password: String(password),
        });
        if (updateErr) return json({ ok: false, error: updateErr.message }, 400);
      } else {
        userId = created.user.id;
      }

      await linkDriver(admin, driver.id, userId);
    }

    await admin
      .from("drivers")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", driver.id);

    const siteUrl = (
      Deno.env.get("SITE_URL") ||
      "https://mr-mpange.github.io/tracksystem"
    ).replace(/\/$/, "");

    return json({
      ok: true,
      email,
      loginUrl: `${siteUrl}/login`,
      message: "Driver can sign in with this email and the password you set. Share the password by phone or SMS.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to set password";
    const status = msg.includes("Unauthorized") || msg.includes("session") ? 401 : msg.includes("manager") ? 403 : 500;
    return json({ ok: false, error: msg }, status);
  }
});
