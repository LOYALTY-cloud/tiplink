import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/earnings/export?range=30|90|year|all
 * Owner/super_admin only: exports all platform earnings as CSV.
 */
export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try { requireRole(admin.role, "revenue"); } catch {
    return NextResponse.json({ error: "Forbidden — insufficient role" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "30";

  const now = new Date();
  let startDate: Date;
  if (range === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (range === "all") {
    startDate = new Date(2020, 0, 1); // effectively no limit
  } else {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - Math.min(Number(range) || 30, 365));
  }

  const { data: transactions, error } = await supabaseAdmin
    .from("transactions_ledger")
    .select("id, user_id, type, amount, status, created_at, meta")
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: true })
    .limit(50000);

  if (error) {
    return NextResponse.json({ error: "Failed to export earnings." }, { status: 500 });
  }

  const rows = transactions ?? [];

  const csvRows: string[] = [
    "Date,User ID,Type,Amount,Status,Transaction ID",
  ];

  for (const tx of rows) {
    const date = new Date(tx.created_at).toISOString().slice(0, 19).replace("T", " ");
    csvRows.push(
      `${date},${tx.user_id},"${tx.type}",${Number(tx.amount).toFixed(2)},${tx.status ?? "completed"},${tx.id}`
    );
  }

  const csv = csvRows.join("\n");
  const filename = `1nelink-admin-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
