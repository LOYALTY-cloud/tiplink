import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Sync external accounts (cards/bank accounts) from a Stripe Connect account
 * into the local payout_methods table.
 *
 * Stripe Connect = source of truth. DB = mirror.
 */
export async function syncExternalAccounts(userId: string, stripeAccountId: string) {
  // Fetch all external accounts from Stripe
  const accounts = await stripe.accounts.listExternalAccounts(stripeAccountId, {
    limit: 10,
  });

  if (!accounts.data.length) return { synced: 0 };

  let synced = 0;

  for (const ext of accounts.data) {
    const isCard = ext.object === "card";
    const isBankAccount = ext.object === "bank_account";

    const brand = isCard ? (ext as any).brand : isBankAccount ? (ext as any).bank_name : null;
    const last4 = (ext as any).last4 ?? null;
    const isDefault = (ext as any).default_for_currency === true;

    // Check if this external account already exists
    const { data: existing } = await supabaseAdmin
      .from("payout_methods")
      .select("id")
      .eq("stripe_external_account_id", ext.id)
      .maybeSingle();

    if (existing) {
      // Update existing record
      await supabaseAdmin
        .from("payout_methods")
        .update({
          brand,
          last4,
          status: "active",
          is_default: isDefault,
        })
        .eq("id", existing.id);
    } else {
      // If this will be default, unset others first
      if (isDefault) {
        await supabaseAdmin
          .from("payout_methods")
          .update({ is_default: false })
          .eq("user_id", userId)
          .eq("is_default", true);
      }

      await supabaseAdmin.from("payout_methods").insert({
        user_id: userId,
        provider: "stripe_connect",
        provider_ref: ext.id,
        type: isCard ? "debit" : "bank_account",
        brand,
        last4,
        stripe_external_account_id: ext.id,
        is_default: isDefault,
        status: "active",
      });
    }

    synced++;
  }

  // Mark any local external-account methods not in Stripe as removed
  const stripeIds = accounts.data.map((a) => a.id);
  const { data: localMethods } = await supabaseAdmin
    .from("payout_methods")
    .select("id, stripe_external_account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("stripe_external_account_id", "is", null);

  if (localMethods) {
    const stale = localMethods.filter(
      (m) => m.stripe_external_account_id && !stripeIds.includes(m.stripe_external_account_id)
    );
    for (const s of stale) {
      await supabaseAdmin
        .from("payout_methods")
        .update({ status: "removed", is_default: false })
        .eq("id", s.id);
    }
  }

  return { synced };
}
