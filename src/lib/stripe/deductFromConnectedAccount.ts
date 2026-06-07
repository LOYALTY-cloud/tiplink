import { stripe } from "@/lib/stripe/server";

/**
 * Deducts `amountDollars` from a Stripe connected account by reversing
 * the most recent transfer(s) from the platform to that account.
 *
 * Used when a creator pays for a platform service (store subscription,
 * theme purchase) using their available wallet balance. This ensures the
 * actual money movement happens on Stripe — not just in the DB ledger.
 *
 * Strategy:
 *   - List transfers to the connected account newest-first.
 *   - For each transfer, calculate how much is still reversible
 *     (original amount − already reversed amount).
 *   - Create partial reversal(s) until the full deduction amount is covered.
 *
 * @returns Array of reversal IDs created, and the total cents reversed.
 * @throws  If there are insufficient reversible funds on Stripe.
 */
export async function deductFromConnectedAccount(
  stripeAccountId: string,
  amountDollars: number,
  description: string,
): Promise<{ reversalIds: string[]; totalReversedCents: number }> {
  const amountCents = Math.round(amountDollars * 100);
  if (amountCents <= 0) throw new Error("deductFromConnectedAccount: amount must be > 0");

  // List transfers to this connected account, newest first.
  const transfers = await stripe.transfers.list({
    destination: stripeAccountId,
    limit: 50,
  });

  let remaining = amountCents;
  const reversalIds: string[] = [];

  for (const transfer of transfers.data) {
    if (remaining <= 0) break;

    // How much of this transfer is still reversible?
    const alreadyReversed = transfer.amount_reversed ?? 0;
    const reversible = transfer.amount - alreadyReversed;
    if (reversible <= 0) continue;

    const toReverse = Math.min(reversible, remaining);

    const reversal = await stripe.transfers.createReversal(transfer.id, {
      amount: toReverse,
      description,
      refund_application_fee: false,
    });

    reversalIds.push(reversal.id);
    remaining -= toReverse;
  }

  if (remaining > 0) {
    throw new Error(
      `deductFromConnectedAccount: insufficient reversible Stripe funds. ` +
      `Needed ${amountCents}¢, still short ${remaining}¢ after reversals.`,
    );
  }

  return { reversalIds, totalReversedCents: amountCents };
}
