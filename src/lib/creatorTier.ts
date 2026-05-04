import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * handleCreatorProgress — called after a theme_sale is approved.
 *
 * Atomically increments total_sales + total_revenue via a DB-level UPDATE.
 *
 * ONLY call this when sale.status transitions to "approved".
 * Do NOT call for: pending, failed, canceled, or promo/free unlocks.
 */
export async function handleCreatorProgress(
  creatorId: string,
  creatorEarnings: number
): Promise<void> {
  const { error: updateErr } = await supabaseAdmin.rpc(
    "increment_creator_progress",
    { p_user_id: creatorId, p_earnings: creatorEarnings }
  );

  if (updateErr) {
    console.error("handleCreatorProgress: increment_creator_progress failed", updateErr);
  }
}
