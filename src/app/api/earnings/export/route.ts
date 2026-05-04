import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/earnings/export?range=all|30|90|year
 * Returns CSV of all tip_received transactions for the authenticated user.
 * Joins with tips table for fee breakdown (platform_fee, net).
 */
export async function GET(req: Request) {
  // Auth: require Bearer token
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: userRes, error: authErr } = await supabaseUser.auth.getUser(token);
  if (authErr || !userRes.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userRes.user.id;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "all";

  // Build date filter
  let startDate: Date | null = null;
  const now = new Date();
  if (range === "30") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 30);
  } else if (range === "90") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 90);
  } else if (range === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
  }
  // "all" = no date filter

  // Fetch ledger entries (tip_received + withdrawals + refunds for complete picture)
  let query = supabaseAdmin
    .from("transactions_ledger")
    .select("id, type, amount, status, created_at, meta, reference_id")
    .eq("user_id", userId)
    .in("type", ["tip_received", "withdrawal", "tip_refunded"])
    .order("created_at", { ascending: true });

  if (startDate) {
    query = query.gte("created_at", startDate.toISOString());
  }

  const { data: transactions, error: txErr } = await query;

  if (txErr) {
    console.error("earnings/export query", txErr);
    return NextResponse.json({ error: "Failed to export earnings" }, { status: 500 });
  }

  // Fetch theme sales (creator's earned rows, not the buyer)
  let themeSalesQuery = supabaseAdmin
    .from("theme_sales")
    .select("id, amount, platform_fee, creator_earnings, created_at, theme_id")
    .eq("seller_id", userId)
    .order("created_at", { ascending: true });

  if (startDate) {
    themeSalesQuery = themeSalesQuery.gte("created_at", startDate.toISOString());
  }

  const { data: themeSales } = await themeSalesQuery;
  const themeSalesRows = themeSales ?? [];

  const rows = transactions ?? [];

  // Fetch tip details for fee info (platform_fee, net)
  const tipRefIds = rows
    .filter((r) => r.type === "tip_received" && r.reference_id)
    .map((r) => r.reference_id!);

  const feeMap = new Map<string, { platform_fee: number; gross: number; net: number }>();
  if (tipRefIds.length > 0) {
    // Supabase .in() has a 100-item soft limit; batch if needed
    const batches: string[][] = [];
    for (let i = 0; i < tipRefIds.length; i += 100) {
      batches.push(tipRefIds.slice(i, i + 100));
    }
    for (const batch of batches) {
      const { data: tips } = await supabaseAdmin
        .from("tips")
        .select("id, amount, platform_fee, net")
        .in("id", batch);
      if (tips) {
        for (const t of tips) {
          feeMap.set(t.id, {
            platform_fee: Number(t.platform_fee ?? 0),
            gross: Number(t.amount ?? 0),
            net: Number(t.net ?? 0),
          });
        }
      }
    }
  }

  // Build CSV
  const csvRows: string[] = [
    "Date,Type,Gross Amount,Platform Fee,Net Amount,Status,Transaction ID,Note",
  ];

  for (const tx of rows) {
    const date = new Date(tx.created_at).toISOString().slice(0, 19).replace("T", " ");
    const meta = (tx.meta ?? {}) as Record<string, unknown>;
    const note = String(meta.message || meta.note || "").replace(/"/g, '""');

    let gross: number;
    let platformFee: number;
    let net: number;

    if (tx.type === "tip_received" && tx.reference_id && feeMap.has(tx.reference_id)) {
      const tipInfo = feeMap.get(tx.reference_id)!;
      gross = tipInfo.gross;
      platformFee = tipInfo.platform_fee;
      net = tipInfo.net;
    } else {
      gross = Math.abs(Number(tx.amount));
      platformFee = 0;
      net = Number(tx.amount);
    }

    const typeLabel =
      tx.type === "tip_received" ? "Tip Received" :
      tx.type === "withdrawal" ? "Withdrawal" :
      tx.type === "tip_refunded" ? "Refund" :
      tx.type;

    csvRows.push(
      `${date},"${typeLabel}",${gross.toFixed(2)},${platformFee.toFixed(2)},${net.toFixed(2)},${tx.status ?? "completed"},${tx.id},"${note}"`
    );
  }

  // Append theme sales rows
  for (const sale of themeSalesRows) {
    const date = new Date(sale.created_at).toISOString().slice(0, 19).replace("T", " ");
    const gross = Number(sale.amount);
    const platformFee = Number(sale.platform_fee);
    const net = Number(sale.creator_earnings);
    csvRows.push(
      `${date},"Theme Sale",${gross.toFixed(2)},${platformFee.toFixed(2)},${net.toFixed(2)},completed,${sale.id},""`
    );
  }

  // Sort all rows chronologically (skip header)
  const header = csvRows[0];
  const dataRows = csvRows.slice(1).sort((a, b) => a.localeCompare(b));
  const csv = [header, ...dataRows].join("\n");
  const filename = `1nelink-earnings-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
