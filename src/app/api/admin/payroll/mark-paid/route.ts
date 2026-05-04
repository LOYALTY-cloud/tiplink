import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";

export const runtime = "nodejs";

/**
 * POST — Mark a payroll run as paid (locks it).
 * Body: { payroll_run_id: string }
 */
export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (admin.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 });

    const { payroll_run_id } = await req.json();
    if (!payroll_run_id || typeof payroll_run_id !== "string") {
      return NextResponse.json({ error: "Missing payroll_run_id" }, { status: 400 });
    }

    // Verify run exists and is still pending
    const { data: run } = await supabaseAdmin
      .from("payroll_runs")
      .select("id, status")
      .eq("id", payroll_run_id)
      .single();

    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });

    const { error } = await supabaseAdmin
      .from("payroll_runs")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payroll_run_id);

    if (error) return NextResponse.json({ error: "Failed to mark payroll as paid." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
