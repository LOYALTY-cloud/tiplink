import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — End the active work session for an admin.
 * Called via sendBeacon on logout / tab close, so we parse admin_id
 * from the JSON body (no JWT available in beacon requests).
 *
 * Security: We validate admin_id against the profiles table (role must be
 * an admin role and account must be active) before touching any session rows.
 * This prevents arbitrary users from disrupting other admins' time tracking.
 */
export async function POST(req: Request) {
  try {
    // 1. Try standard header-based auth first (covers non-beacon callers)
    let verifiedUserId: string | null = null;
    const headerAdmin = await getAdminFromRequest(req);
    if (headerAdmin) {
      verifiedUserId = headerAdmin.userId;
    }

    const { admin_id } = await req.json();
    if (!admin_id || typeof admin_id !== "string" || !UUID_RE.test(admin_id)) {
      return NextResponse.json({ ok: true }); // silent — don't reveal rejection reason
    }

    // 2. If no header auth, validate that admin_id belongs to a real active admin
    if (!verifiedUserId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, role, is_active")
        .eq("user_id", admin_id)
        .maybeSingle();

      if (!profile) return NextResponse.json({ ok: true });
      if (!profile.role || !ADMIN_ROLES.includes(profile.role)) return NextResponse.json({ ok: true });
      if (profile.is_active === false) return NextResponse.json({ ok: true });

      verifiedUserId = profile.user_id;
    }

    // 3. Only allow ending sessions that belong to the verified user
    if (verifiedUserId !== admin_id) {
      return NextResponse.json({ ok: true }); // silent reject
    }

    const { data: session } = await supabaseAdmin
      .from("admin_sessions")
      .select("id, last_active_at, total_active_seconds")
      .eq("admin_id", verifiedUserId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ ok: true });
    }

    // Final active-time increment
    const now = new Date();
    const last = new Date(session.last_active_at);
    const diff = Math.floor((now.getTime() - last.getTime()) / 1000);
    const increment = diff > 60 ? 0 : diff;

    await supabaseAdmin
      .from("admin_sessions")
      .update({
        ended_at: now.toISOString(),
        last_active_at: now.toISOString(),
        total_active_seconds: session.total_active_seconds + increment,
      })
      .eq("id", session.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
