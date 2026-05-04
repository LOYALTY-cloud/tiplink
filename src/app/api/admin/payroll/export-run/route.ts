import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET — Export a payroll run's items as CSV.
 * Query: ?id=<payroll_run_id>
 */
export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return new Response("Unauthorized", { status: 401 });
    try { requireRole(admin.role, "payroll"); } catch { return new Response("Forbidden", { status: 403 }); }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing id", { status: 400 });

    const { data: run } = await supabaseAdmin
      .from("payroll_runs")
      .select("start_date, end_date, status, total_amount")
      .eq("id", id)
      .single();

    if (!run) return new Response("Run not found", { status: 404 });

    const { data: items } = await supabaseAdmin
      .from("payroll_items")
      .select("name, role, hours, rate, total_pay")
      .eq("payroll_run_id", id)
      .order("total_pay", { ascending: false });

    const rows = (items ?? []).map((i) => {
      const escapeCsv = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
      return [escapeCsv(i.name ?? ""), escapeCsv(i.role ?? ""), Number(i.hours).toFixed(2), Number(i.rate).toFixed(2), Number(i.total_pay).toFixed(2)].join(",");
    });

    const csv = [
      `Payroll Run: ${run.start_date} to ${run.end_date} (${run.status})`,
      "",
      "Name,Role,Hours,Rate,Total",
      ...rows,
      "",
      `Total,,,,$${Number(run.total_amount).toFixed(2)}`,
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=payroll-${run.start_date}-to-${run.end_date}.csv`,
      },
    });
  } catch {
    return new Response("Internal error", { status: 500 });
  }
}
