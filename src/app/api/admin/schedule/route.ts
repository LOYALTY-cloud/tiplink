import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
type Day = typeof DAYS[number];

const OWNER_ROLES = ["owner", "co_owner", "super_admin"];

// ── Validate a time string "HH:MM" ───────────────────────────────────────────
function isValidTime(t: unknown): t is string {
  if (typeof t !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/**
 * GET /api/admin/schedule
 *
 * ?admin_id=<uuid>   — fetch one admin's schedule (owner) or own schedule
 * (no param)         — owner: fetch ALL schedules; admin: fetch own
 */
export async function GET(req: Request) {
  try {
    const caller = await getAdminFromRequest(req);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url     = new URL(req.url);
    const adminId = url.searchParams.get("admin_id");
    const isOwner = OWNER_ROLES.includes(caller.role);

    // Single admin lookup
    if (adminId) {
      // Non-owners can only read their own schedule
      if (!isOwner && adminId !== caller.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { data, error } = await supabaseAdmin
        .from("admin_schedules")
        .select("*")
        .eq("admin_id", adminId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ schedule: data ?? null });
    }

    // No param: owner gets all, non-owner gets own
    if (!isOwner) {
      const { data } = await supabaseAdmin
        .from("admin_schedules")
        .select("*")
        .eq("admin_id", caller.userId)
        .maybeSingle();
      return NextResponse.json({ schedule: data ?? null });
    }

    // Owner: return all schedules joined with profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, last_active_at")
      .in("role", ADMIN_ROLES);

    const { data: schedules } = await supabaseAdmin
      .from("admin_schedules")
      .select("*");

    const scheduleMap = new Map((schedules ?? []).map(s => [s.admin_id, s]));

    const result = (profiles ?? []).map(p => ({
      admin_id:       p.user_id,
      name:           p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.display_name || "Unnamed",
      role:           p.role,
      last_active_at: p.last_active_at ?? null,
      schedule:       scheduleMap.get(p.user_id) ?? null,
    }));

    return NextResponse.json({ admins: result });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/schedule
 *
 * Body: { admin_id, monday_start, monday_end, monday_off, ... }
 * Owner only. Upserts the schedule for the given admin.
 */
export async function POST(req: Request) {
  try {
    const caller = await getAdminFromRequest(req);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!OWNER_ROLES.includes(caller.role)) {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const body = await req.json();
    const { admin_id } = body;
    if (!admin_id || typeof admin_id !== "string") {
      return NextResponse.json({ error: "admin_id required" }, { status: 400 });
    }

    // Confirm target is an admin
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("user_id, role")
      .eq("user_id", admin_id)
      .maybeSingle();

    if (!target || !target.role || !ADMIN_ROLES.includes(target.role)) {
      return NextResponse.json({ error: "Target is not an admin" }, { status: 404 });
    }

    // Build validated payload
    const payload: Record<string, unknown> = {
      admin_id,
      updated_by: caller.userId,
      updated_at: new Date().toISOString(),
    };

    for (const day of DAYS) {
      const off   = body[`${day}_off`];
      const start = body[`${day}_start`];
      const end   = body[`${day}_end`];

      payload[`${day}_off`]   = Boolean(off);
      payload[`${day}_start`] = (!off && isValidTime(start)) ? start : null;
      payload[`${day}_end`]   = (!off && isValidTime(end))   ? end   : null;
    }

    const { data, error } = await supabaseAdmin
      .from("admin_schedules")
      .upsert(payload, { onConflict: "admin_id" })
      .select()
      .single();

    if (error) {
      console.error("schedule upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedule: data });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
