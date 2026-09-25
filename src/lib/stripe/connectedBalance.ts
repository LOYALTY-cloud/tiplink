import { stripe } from "@/lib/stripe/server";

export type ConnectedUsdBalance = {
  available: number;
  pending: number;
  total: number;
};

export async function getConnectedUsdBalance(stripeAccountId: string): Promise<ConnectedUsdBalance> {
  const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
  const sumUsd = (entries: Array<{ currency: string; amount: number }>) =>
    entries
      .filter((entry) => entry.currency === "usd")
      .reduce((sum, entry) => sum + entry.amount, 0) / 100;

  const available = sumUsd(balance.available ?? []);
  const pending = sumUsd(balance.pending ?? []);

  return { available, pending, total: available + pending };
}