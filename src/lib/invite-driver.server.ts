import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InviteResult = {
  ok: boolean;
  error?: string;
  email?: string;
  inviteLink?: string;
  emailSent?: boolean;
  emailError?: string | null;
};

function getRedirectUrl(siteUrl: string) {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/accept-invite`;
}

async function linkDriverAccount(driverId: string, userId: string) {
  await supabaseAdmin.from("drivers").update({ user_id: userId }).eq("id", driverId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "driver" });
}

/** Optional Supabase invite email (requires SMTP). Prefer setDriverPassword. */
export async function inviteDriver(
  driverId: string,
  siteUrl: string,
  sendEmail = false
): Promise<InviteResult> {
  const { data: driver, error: driverErr } = await supabaseAdmin
    .from("drivers")
    .select("id, full_name, email, user_id")
    .eq("id", driverId)
    .maybeSingle();

  if (driverErr || !driver) {
    return { ok: false, error: "Driver not found" };
  }

  if (!driver.email?.trim()) {
    return { ok: false, error: "Driver has no email" };
  }

  if (driver.user_id) {
    return { ok: false, error: "Driver already has an account" };
  }

  const email = driver.email.trim().toLowerCase();
  const base = (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    siteUrl
  ).replace(/\/$/, "");
  const redirectTo = getRedirectUrl(base);

  let emailSent = false;
  let emailError: string | null = null;

  if (sendEmail) {
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: driver.full_name, role: "driver" },
    });
    emailSent = !inviteErr;
    emailError = inviteErr?.message ?? null;
  } else {
    emailError = "Pass sendEmail:true to send invite email (requires SMTP).";
  }

  return {
    ok: true,
    email,
    emailSent,
    emailError,
  };
}
