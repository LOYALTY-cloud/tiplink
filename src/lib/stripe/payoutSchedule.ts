import type Stripe from "stripe";

/**
 * Held withdrawals are released by the app, so Stripe must not auto-pay the balance out
 * to the bank during the hold. Idempotent; returns the schedule that was in place before.
 */
export async function ensureManualPayoutSchedule(
  stripe: Stripe,
  accountId: string
): Promise<{ changed: boolean; previous: string | null }> {
  const account = await stripe.accounts.retrieve(accountId);
  const previous = account.settings?.payouts?.schedule?.interval ?? null;
  if (previous === "manual") return { changed: false, previous };

  await stripe.accounts.update(accountId, {
    settings: { payouts: { schedule: { interval: "manual" } } },
  });
  return { changed: true, previous };
}
