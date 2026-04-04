import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "./permissions";

export type AdminSession = { userId: string; role: string };

/**
 * Authenticate an admin from a Bearer JWT or an Admin ID.
 * Returns { userId, role } for any admin-level role, or null.
 */
export async function getAdminFromSession(
  accessToken: string | null,
  adminId?: string | null,
): Promise<AdminSession | null> {
  // Path 1: Authenticate via admin_id
  if (adminId) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role, is_active, last_active_at")
      .eq("admin_id", adminId)
      .maybeSingle();

    if (profileErr || !profile) return null;
    if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;
    if (profile.is_active === false) return null;

    // Throttled last_active_at + availability update (max once per minute)
    const now = Date.now();
    const last = new Date(profile.last_active_at || 0).getTime();
    if (now - last > 60_000) {
      // Check if admin is in any active support sessions → busy, else online
      supabaseAdmin
        .from("support_sessions")
        .select("id", { count: "exact", head: true })
        .eq("assigned_admin_id", profile.user_id)
        .eq("status", "active")
        .then(({ count }) => {
          const status = (count ?? 0) > 0 ? "busy" : "online";
          supabaseAdmin
            .from("profiles")
            .update({ last_active_at: new Date().toISOString(), availability: status })
            .eq("user_id", profile.user_id)
            .then(() => {}, () => {});
        }, () => {});
    }

    return { userId: profile.user_id, role: profile.role };
  }

  // Path 2: Authenticate via Supabase JWT
  if (!accessToken) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const user = data.user;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("role, last_active_at")
    .eq("user_id", user.id)
    .single()
    .returns<import("@/types/db").ProfileRow>();

  if (profileErr || !profile) return null;
  if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;

  // Throttled last_active_at + availability update (max once per minute)
  const now = Date.now();
  const last = new Date(profile.last_active_at || 0).getTime();
  if (now - last > 60_000) {
    supabaseAdmin
      .from("support_sessions")
      .select("id", { count: "exact", head: true })
      .eq("assigned_admin_id", user.id)
      .eq("status", "active")
      .then(({ count }) => {
        const status = (count ?? 0) > 0 ? "busy" : "online";
        supabaseAdmin
          .from("profiles")
          .update({ last_active_at: new Date().toISOString(), availability: status })
          .eq("user_id", user.id)
          .then(() => {}, () => {});
      }, () => {});
  }

  return { userId: user.id, role: profile.role };
}

/**
 * Convenience: extract admin session from a Request object.
 * Checks both Authorization Bearer JWT and X-Admin-Id header.
 */
export async function getAdminFromRequest(req: Request): Promise<AdminSession | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const adminId = req.headers.get("x-admin-id") ?? null;
  return getAdminFromSession(jwt, adminId);
}
