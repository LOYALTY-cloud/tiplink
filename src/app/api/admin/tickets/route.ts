import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/** GET /api/admin/tickets — list all tickets for admin */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    let query = supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, subject, category, status, priority, assigned_admin_id, waiting_on, sla_response_deadline, sla_resolve_deadline, first_response_at, breach_notified, created_at, updated_at")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: tickets } = await query;

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
