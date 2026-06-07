import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const VALID_ROLES = ADMIN_ROLES as readonly string[];

/**
 * POST — Upsert a pay rate (per-admin override or role default).
 * Body: { admin_id?: string, role?: string, hourly_rate: number }
 */
export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (admin.role !== "owner") {
      return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }

    const body = await req.json();
    const hourly_rate = Number(body.hourly_rate);

    if (!Number.isFinite(hourly_rate) || hourly_rate < 0 || hourly_rate > 1000) {
      return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
    }

    if (body.admin_id && typeof body.admin_id === "string") {
      // Per-admin override
      const { error } = await supabaseAdmin
        .from("admin_pay_rates")
        .upsert(
          { admin_id: body.admin_id, role: null, hourly_rate },
          { onConflict: "admin_id" }
        );

      if (error) {
        return NextResponse.json({ error: "Failed to save payroll rate." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, type: "admin", admin_id: body.admin_id });
    }

    if (body.role && typeof body.role === "string" && VALID_ROLES.includes(body.role)) {
      // Role default
      const { error } = await supabaseAdmin
        .from("admin_pay_rates")
        .upsert(
          { admin_id: null, role: body.role, hourly_rate },
          { onConflict: "role" }
        );

      if (error) {
        return NextResponse.json({ error: "Failed to save role rate." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, type: "role", role: body.role });
    }

    return NextResponse.json({ error: "Provide admin_id or valid role" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
