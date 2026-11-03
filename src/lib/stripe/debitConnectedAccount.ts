import { stripe } from "@/lib/stripe/server";
import { deductFromConnectedAccount } from "@/lib/stripe/deductFromConnectedAccount";

export type DebitMethod = "account_debit" | "transfer_reversal";

export class InsufficientStripeBalanceError extends Error {
  constructor(public neededCents: number, public availableCents: number) {
    super(`Connected account has ${availableCents}¢ available on Stripe, needs ${neededCents}¢.`);
    this.name = "InsufficientStripeBalanceError";
  }
}

/**
 * New accounts (platform collects requirements, no Stripe Dashboard) receive tips as
 * direct charges, so there is no platform->account transfer to reverse. They are
 * collected from with Account Debits instead. Anything else (legacy Express) keeps
 * the transfer-reversal path. If the account can't be looked up we also fall back to
 * the legacy path, which preserves its existing failure behavior.
 */
export async function resolveDebitMethod(stripeAccountId: string): Promise<DebitMethod> {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return account.controller?.requirement_collection === "application" ? "account_debit" : "transfer_reversal";
  } catch {
    return "transfer_reversal";
  }
}

export type ConnectedAccountDebit = {
  method: DebitMethod;
  /** Stripe payment id for an account debit. */
  debitId: string | null;
  /** Transfer reversal ids for the legacy path. */
  reversalIds: string[];
};

/**
 * Moves `amountDollars` from the connected account's Stripe balance to the platform.
 *
 * Account Debits succeed even when the account has no available funds (the balance goes
 * negative), so the available balance is checked first and the debit is idempotent.
 * Requires that the platform is responsible for negative balances on the account.
 */
export async function debitConnectedAccount(
  stripeAccountId: string,
  amountDollars: number,
  description: string,
  method: DebitMethod,
  options: { idempotencyKey?: string; metadata?: Record<string, string> } = {},
): Promise<ConnectedAccountDebit> {
  if (method === "transfer_reversal") {
    const { reversalIds } = await deductFromConnectedAccount(stripeAccountId, amountDollars, description);
    return { method, debitId: null, reversalIds };
  }

  const amountCents = Math.round(amountDollars * 100);
  if (amountCents <= 0) throw new Error("debitConnectedAccount: amount must be > 0");

  const balance = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });
  const availableCents = (balance.available ?? [])
    .filter((b) => b.currency === "usd")
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
  if (availableCents < amountCents) {
    throw new InsufficientStripeBalanceError(amountCents, availableCents);
  }

  const debit = await stripe.charges.create(
    {
      amount: amountCents,
      currency: "usd",
      source: stripeAccountId,
      description,
      metadata: options.metadata,
    },
    options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
  );

  return { method, debitId: debit.id, reversalIds: [] };
}
