import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key missing");
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" as any });
  }
  return stripeInstance;
}
