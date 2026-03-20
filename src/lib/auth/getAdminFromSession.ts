import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "./permissions";

export type AdminSession = { userId: string; role: string };

/**
 * Authenticate an admin from a Bearer JWT.
 * Returns { userId, role } for any admin-level role, or null.
 */
export async function getAdminFromSession(
  accessToken: string | null,
): Promise<AdminSession | null> {
  if (!accessToken) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const user = data.user;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()
    .returns<import("@/types/db").ProfileRow>();

  if (profileErr || !profile) return null;
  if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;

  return { userId: user.id, role: profile.role };
}
