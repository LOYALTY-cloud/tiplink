import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { evaluateAndPersistAdminRisk } from "@/lib/adminRiskEngine";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

// GET — list all admin staff
export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try { requireRole(session.role, "staff"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

    // Lazy-sync: ensure every profile with an admin role has a row in `admins`
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, display_name, role")
      .in("role", ADMIN_ROLES as unknown as string[]);

    if (adminProfiles && adminProfiles.length > 0) {
      const { data: existingAdmins } = await supabaseAdmin
        .from("admins")
        .select("user_id");
      const existingIds = new Set((existingAdmins ?? []).map((a) => a.user_id));

      const missing = adminProfiles.filter((p) => !existingIds.has(p.user_id));
      if (missing.length > 0) {
        await supabaseAdmin.from("admins").upsert(
          missing.map((p) => ({
            user_id: p.user_id,
            full_name: p.display_name ?? "Unknown",
            role: p.role === "owner" ? "owner" : "admin",
            status: "active",
          })),
          { onConflict: "user_id" },
        );
      }
    }

    const { data: admins, error } = await supabaseAdmin
      .from("admins")
      .select("id, user_id, full_name, role, status, restricted_until, suspended_until, created_at, last_login_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch staff." }, { status: 500 });
    }

    // Enrich each admin with action counts, profile data, last action, risk score
    // Also fetch system-level auto-removed count (owner-visible moderator accountability)
    const [enriched, autoRemovedResult] = await Promise.all([
      Promise.all(
        (admins ?? []).map(async (admin) => {
          const [
            { count },
            { data: profile },
            { data: lastAction },
            { count: approvedCount },
            { count: rejectedCount },
          ] = await Promise.all([
            supabaseAdmin
              .from("admin_actions")
              .select("id", { count: "exact", head: true })
              .eq("admin_id", admin.user_id),
            supabaseAdmin
              .from("profiles")
              .select("admin_id, availability, last_active_at")
              .eq("user_id", admin.user_id)
              .maybeSingle(),
            supabaseAdmin
              .from("admin_actions")
              .select("action, created_at, target_user")
              .eq("admin_id", admin.user_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabaseAdmin
              .from("admin_actions")
              .select("id", { count: "exact", head: true })
              .eq("admin_id", admin.user_id)
              .eq("action", "marketplace_theme_approve"),
            supabaseAdmin
              .from("admin_actions")
              .select("id", { count: "exact", head: true })
              .eq("admin_id", admin.user_id)
              .eq("action", "marketplace_theme_reject"),
          ]);

          // Calculate + persist risk score (only for non-owner)
          let risk: { score: number; level: string } = { score: 0, level: "low" };
          if (admin.role !== "owner") {
            const riskData = await evaluateAndPersistAdminRisk(admin.user_id);
            risk = { score: riskData.score, level: riskData.level };
          }

          // Resolve last_login_at: fall back to Supabase Auth last_sign_in_at
          let lastLogin = admin.last_login_at;
          if (!lastLogin) {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(admin.user_id);
            lastLogin = authUser?.user?.last_sign_in_at ?? profile?.last_active_at ?? null;
          }

          return {
            ...admin,
            last_login_at: lastLogin,
            action_count: count ?? 0,
            admin_id_display: profile?.admin_id ?? null,
            availability: profile?.availability ?? "offline",
            last_active_at: profile?.last_active_at ?? null,
            last_action: lastAction ?? null,
            risk_score: risk.score,
            risk_level: risk.level,
            themes_approved: approvedCount ?? 0,
            themes_rejected: rejectedCount ?? 0,
          };
        })
      ),
      // Total themes auto-removed system-wide due to no moderation decision
      supabaseAdmin
        .from("admin_actions")
        .select("id", { count: "exact", head: true })
        .eq("action", "marketplace_theme_auto_removed"),
    ]);

    return NextResponse.json({
      admins: enriched,
      themes_auto_removed_total: autoRemovedResult.count ?? 0,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
