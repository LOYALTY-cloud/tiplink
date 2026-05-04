import { supabaseAdmin } from "@/lib/supabase/admin";
import { ADMIN_ROLES } from "./permissions";
import { verifyAdminToken } from "./adminJwt";

export type AdminSession = { userId: string; role: string };

/**
 * Update last_active_at + availability with throttle (max once/min).
 */
function throttledActivityUpdate(userId: string, lastActiveAt: string | null) {
  const now = Date.now();
  const last = new Date(lastActiveAt || 0).getTime();
  if (now - last > 60_000) {
    supabaseAdmin
      .from("support_sessions")
      .select("id", { count: "exact", head: true })
      .eq("assigned_admin_id", userId)
      .eq("status", "active")
      .then(({ count }) => {
        const status = (count ?? 0) > 0 ? "busy" : "online";
        supabaseAdmin
          .from("profiles")
          .update({ last_active_at: new Date().toISOString(), availability: status })
          .eq("user_id", userId)
          .then(() => {}, () => {});
      }, () => {});
  }
}

/**
 * Authenticate an admin from a signed admin JWT, a Bearer Supabase JWT, or
 * (legacy) an admin_id header.
 *
 * Priority:
 *  1. Signed admin JWT (Authorization: Bearer <admin-jwt>)
 *  2. Supabase JWT (Authorization: Bearer <supabase-jwt>)
 *  3. Raw admin_id header — DEPRECATED. Only allowed as fallback during migration.
 *
 * Returns { userId, role } for any admin-level role, or null.
 */
export async function getAdminFromSession(
  accessToken: string | null,
  adminId?: string | null,
): Promise<AdminSession | null> {

  // Path 1: Signed admin JWT (preferred — issued by /api/admin/login)
  if (accessToken) {
    const adminPayload = await verifyAdminToken(accessToken);
    if (adminPayload) {
      // JWT is valid — confirm user still has admin role and is active
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id, role, is_active, last_active_at")
        .eq("user_id", adminPayload.sub)
        .maybeSingle();

      if (profileErr || !profile) return null;
      if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;
      if (profile.is_active === false) return null;

      throttledActivityUpdate(profile.user_id, profile.last_active_at);
      return { userId: profile.user_id, role: profile.role };
    }

    // Not an admin JWT — try as Supabase JWT (Path 2)
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (!error && data?.user) {
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("role, last_active_at")
        .eq("user_id", data.user.id)
        .single()
        .returns<import("@/types/db").ProfileRow>();

      if (profileErr || !profile) return null;
      if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;

      throttledActivityUpdate(data.user.id, profile.last_active_at ?? null);
      return { userId: data.user.id, role: profile.role };
    }
  }

  // Path 3 (LEGACY): Authenticate via admin_id — will be removed in future
  if (adminId) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role, is_active, last_active_at")
      .eq("admin_id", adminId)
      .maybeSingle();

    if (profileErr || !profile) return null;
    if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return null;
    if (profile.is_active === false) return null;

    throttledActivityUpdate(profile.user_id, profile.last_active_at);
    return { userId: profile.user_id, role: profile.role };
  }

  return null;
}

/**
 * Convenience: extract admin session from a Request object.
 * Checks Authorization Bearer token first (admin JWT or Supabase JWT),
 * then falls back to X-Admin-Id header (legacy).
 */
export async function getAdminFromRequest(req: Request): Promise<AdminSession | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const adminId = req.headers.get("x-admin-id") ?? null;
  return getAdminFromSession(jwt, adminId);
}
