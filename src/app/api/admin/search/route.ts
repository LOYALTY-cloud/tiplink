import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

/**
 * GET /api/admin/search?q=<query>
 * Server-side universal search — profiles, tips, transactions.
 */
export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  requireRole(session.role, "view_admin");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ users: [], tips: [], transactions: [] });
  }

  // Run all searches in parallel on the server
  const [byId, byText, tips, txs] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id, handle, display_name, account_status")
      .or(`user_id.eq.${q}`)
      .limit(3),
    supabaseAdmin
      .from("profiles")
      .select("user_id, handle, display_name, account_status")
      .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(5),
    supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, tip_amount, stripe_payment_intent_id, creator_user_id, status, created_at")
      .or(`receipt_id.eq.${q},stripe_payment_intent_id.eq.${q}`)
      .limit(5),
    supabaseAdmin
      .from("transactions_ledger")
      .select("id, type, amount, reference_id, user_id, created_at")
      .eq("reference_id", q)
      .limit(5),
  ]);

  // Deduplicate users
  const seen = new Set<string>();
  const users = [];
  for (const p of [...(byId.data ?? []), ...(byText.data ?? [])]) {
    if (seen.has(p.user_id)) continue;
    seen.add(p.user_id);
    users.push(p);
  }

  return NextResponse.json({
    users,
    tips: tips.data ?? [],
    transactions: txs.data ?? [],
  });
}
