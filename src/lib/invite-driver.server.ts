import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InviteResult = {
  ok: boolean;
  error?: string;
  email?: string;
  inviteLink?: string;
  emailSent?: boolean;
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

/** Invite driver via Supabase Auth email + copyable link. */
export async function inviteDriver(driverId: string, siteUrl: string): Promise<InviteResult> {
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
  const redirectTo = getRedirectUrl(siteUrl);
  const meta = { full_name: driver.full_name, role: "driver" };

  // 1. Send invite email (creates auth user)
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo, data: meta }
  );

  const emailSent = !inviteErr;
  let userId = inviteData?.user?.id;

  if (inviteErr) {
    const msg = inviteErr.message?.toLowerCase() ?? "";
    const exists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!exists) {
      console.warn("[Invite] email:", inviteErr.message);
    }
  }

  // 2. Generate link for admin to copy (WhatsApp / SMS)
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, data: meta },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    return {
      ok: false,
      error: linkErr?.message ?? inviteErr?.message ?? "Failed to generate invite link",
    };
  }

  userId = userId ?? linkData.user?.id;
  if (userId) {
    await linkDriverAccount(driver.id, userId);
  }

  await supabaseAdmin
    .from("drivers")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", driver.id);

  return {
    ok: true,
    email,
    inviteLink: linkData.properties.action_link,
    emailSent,
  };
}
