import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function requireFleetManager(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Unauthorized", 401);
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new AuthError("Invalid session", 401);
  }

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const canManage = (roles ?? []).some((r) =>
    r.role === "super_admin" || r.role === "fleet_manager"
  );

  if (!canManage) {
    throw new AuthError("Fleet manager access required", 403);
  }

  return user.id;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}
