import { supabaseAdmin } from "@/lib/supabase/admin";

export type TaxExportPayload = {
  year: number;
  creatorName: string;
  creatorEmail: string | null;
  total_earnings: number;
  total_payouts: number;
  sales: Array<{
    id: string;
    created_at: string;
    creator_earnings: number;
    status: string;
    stripe_session_id?: string | null;
  }>;
  payouts: Array<{
    id: string;
    processed_at: string | null;
    amount: number;
    status: string;
    stripe_transfer_id?: string | null;
    receipt_url?: string | null;
  }>;
  generatedAt: string;
};

export async function buildTaxPayload(userId: string, year: number): Promise<TaxExportPayload> {
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd   = `${year + 1}-01-01T00:00:00.000Z`;

  const [
    { data: sales },
    { data: payouts },
    { data: profile },
  ] = await Promise.all([
    supabaseAdmin
      .from("theme_sales")
      .select("id, created_at, creator_earnings, status, stripe_session_id")
      .eq("seller_id", userId)
      .in("status", ["approved", "paid"])
      .gte("created_at", yearStart)
      .lt("created_at", yearEnd)
      .order("created_at", { ascending: true }),

    supabaseAdmin
      .from("payout_requests")
      .select("id, processed_at, amount, status, stripe_transfer_id, receipt_url")
      .eq("user_id", userId)
      .eq("status", "paid")
      .gte("processed_at", yearStart)
      .lt("processed_at", yearEnd)
      .order("processed_at", { ascending: true }),

    supabaseAdmin
      .from("profiles")
      .select("display_name, handle, email")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const totalEarnings = (sales ?? []).reduce((s, r) => s + Number(r.creator_earnings), 0);
  const totalPayouts  = (payouts ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const creatorName =
    (profile as { display_name?: string | null; handle?: string | null } | null)?.display_name ??
    (profile as { display_name?: string | null; handle?: string | null } | null)?.handle ??
    "Creator";

  return {
    year,
    creatorName,
    creatorEmail: (profile as { email?: string | null } | null)?.email ?? null,
    total_earnings: Math.round(totalEarnings * 100) / 100,
    total_payouts:  Math.round(totalPayouts  * 100) / 100,
    sales: sales ?? [],
    payouts: payouts ?? [],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Authenticates a request via Bearer token and returns the user ID.
 * Returns null if unauthenticated (caller should return 401).
 */
export async function getUserIdFromToken(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}
