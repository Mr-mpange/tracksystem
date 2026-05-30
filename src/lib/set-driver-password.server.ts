import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SetPasswordResult = {
  ok: boolean;
  error?: string;
  email?: string;
  loginUrl?: string;
  message?: string;
};

async function linkDriver(driverId: string, userId: string) {
  await supabaseAdmin.from("drivers").update({ user_id: userId }).eq("id", driverId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "driver" });
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  while (page <= 10) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const match = data?.users?.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if ((data?.users?.length ?? 0) < 200) break;
    page++;
  }
  return null;
}

/** Create or update driver login — no email required. */
export async function setDriverPassword(
  driverId: string,
  password: string
): Promise<SetPasswordResult> {
  const { data: driver, error: driverErr } = await supabaseAdmin
    .from("drivers")
    .select("id, full_name, email, user_id")
    .eq("id", driverId)
    .maybeSingle();

  if (driverErr || !driver) return { ok: false, error: "Driver not found" };
  if (!driver.email?.trim()) return { ok: false, error: "Driver has no email" };

  const email = driver.email.trim().toLowerCase();
  const meta = { full_name: driver.full_name, role: "driver" };
  let userId = driver.user_id;

  if (userId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() ?? "";
      const exists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!exists) return { ok: false, error: createErr.message };

      userId = await findUserIdByEmail(email);
      if (!userId) return { ok: false, error: "Account exists but could not be linked" };

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (updateErr) return { ok: false, error: updateErr.message };
    } else {
      userId = created.user.id;
    }

    await linkDriver(driver.id, userId);
  }

  await supabaseAdmin
    .from("drivers")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", driver.id);

  const siteUrl = (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://mr-mpange.github.io/tracksystem"
  ).replace(/\/$/, "");

  return {
    ok: true,
    email,
    loginUrl: `${siteUrl}/login`,
    message: "Driver can sign in with this email and the password you set.",
  };
}
