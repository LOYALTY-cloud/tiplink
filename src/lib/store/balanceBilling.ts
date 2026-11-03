import { supabaseAdmin } from "@/lib/supabase/admin";
import { addLedgerEntry } from "@/lib/ledger";
import {
  debitConnectedAccount,
  resolveDebitMethod,
  InsufficientStripeBalanceError,
} from "@/lib/stripe/debitConnectedAccount";

export const STORE_PRICE_DOLLARS = 9.99;
/** Matches the grace period given to card subscriptions on invoice.payment_failed. */
export const STORE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export type StoreChargeAction = "creator_store_open" | "creator_store_recovery" | "creator_store_renewal";

export type StoreChargeResult =
  | { ok: true }
  | { ok: false; reason: "insufficient_balance" | "stripe_debit_failed"; detail?: string };

/**
 * Charges the Creator Store price to the creator's wallet and connected Stripe balance.
 * The caller MUST hold the creator's "withdrawal" wallet lock.
 *
 * New accounts: the Stripe debit must succeed before the ledger is touched, otherwise
 * the wallet would drift from the Stripe balance. Legacy accounts keep the old
 * behavior (a failed transfer reversal is logged and the ledger is still charged).
 */
export async function chargeStoreFromBalance(args: {
  userId: string;
  action: StoreChargeAction;
  description: string;
  idempotencyKey: string;
}): Promise<StoreChargeResult> {
  const { userId, action, description, idempotencyKey } = args;

  const { data: wallet } = await supabaseAdmin
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const balance = Number(wallet?.balance ?? 0);
  if (!Number.isFinite(balance) || balance < STORE_PRICE_DOLLARS) {
    return { ok: false, reason: "insufficient_balance" };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  let stripeMeta: { stripe_debit_method?: string; stripe_debit_id?: string | null; stripe_reversal_ids?: string[] } = {};
  if (profile?.stripe_account_id) {
    const method = await resolveDebitMethod(profile.stripe_account_id);
    try {
      const debit = await debitConnectedAccount(
        profile.stripe_account_id,
        STORE_PRICE_DOLLARS,
        description,
        method,
        { idempotencyKey, metadata: { user_id: userId, action } },
      );
      stripeMeta = {
        stripe_debit_method: debit.method,
        stripe_debit_id: debit.debitId,
        stripe_reversal_ids: debit.reversalIds,
      };
    } catch (stripeErr) {
      console.error(`store billing (${action}): Stripe deduction failed:`, stripeErr);
      if (method === "account_debit") {
        return {
          ok: false,
          reason: stripeErr instanceof InsufficientStripeBalanceError ? "insufficient_balance" : "stripe_debit_failed",
          detail: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        };
      }
      // Legacy accounts: unchanged behavior — continue and charge the ledger.
    }
  }

  await addLedgerEntry({
    user_id: userId,
    type: "fee",
    amount: -STORE_PRICE_DOLLARS,
    meta: {
      action,
      payment_method: "wallet_balance",
      amount_usd: STORE_PRICE_DOLLARS,
      description,
      ...stripeMeta,
    },
    status: "completed",
  }).catch(async (ledgerErr) => {
    if (stripeMeta.stripe_debit_id) {
      const { sendAdminAlert } = await import("@/lib/adminAlerts");
      sendAdminAlert({
        subject: "Store billing: Stripe debit succeeded but ledger write failed",
        body: `User ${userId} was debited $${STORE_PRICE_DOLLARS} on Stripe (${stripeMeta.stripe_debit_id}) but the ledger entry failed: ${ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr)}. Reconcile manually.`,
        severity: "critical",
        meta: { userId, action, stripe_debit_id: stripeMeta.stripe_debit_id },
      });
    }
    throw ledgerErr;
  });

  return { ok: true };
}

/** Best-effort invoice log; never throws. Alerts admins if a paid invoice can't be recorded. */
export async function recordStoreBalanceInvoice(args: {
  userId: string;
  storeId: string | null;
  status: "paid" | "failed";
}): Promise<void> {
  const { userId, storeId, status } = args;
  const { error } = await supabaseAdmin.from("store_invoices").insert({
    user_id: userId,
    store_id: storeId,
    amount: STORE_PRICE_DOLLARS,
    status,
    billing_type: "balance",
    paid_at: status === "paid" ? new Date().toISOString() : null,
  });

  if (error) {
    console.error("store billing: invoice insert failed", { userId, storeId, status, error: error.message });
    if (status === "paid") {
      try {
        const { sendAdminAlert } = await import("@/lib/adminAlerts");
        sendAdminAlert({
          subject: "store billing: store_invoices insert failed",
          body: `User ${userId} was charged $${STORE_PRICE_DOLLARS} but no invoice record was created. Manual reconciliation required.`,
          severity: "critical",
          meta: { userId, storeId, amount: STORE_PRICE_DOLLARS, error: error.message },
        });
      } catch (_) {}
    }
  }
}
