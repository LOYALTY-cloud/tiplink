"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function InnerCheckout({
  receiptUrl,
}: {
  receiptUrl: string; // absolute URL to /r/:receiptId
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;

    setPaying(true);
    setError(null);

    try {
      const paymentEl = elements.getElement(PaymentElement);
      if (!paymentEl) {
        setError("Payment form not ready. Please wait a moment and try again.");
        setPaying(false);
        return;
      }

      const res = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          // If 3DS is required, Stripe will redirect here after auth.
          return_url: receiptUrl,
        },
      });

      if (res.error) {
        setError(res.error.message || "Payment failed");
        setPaying(false);
        return;
      }

      // If no redirect was required, we land here -> redirect ourselves:
      router.push(new URL(receiptUrl).pathname);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err ?? "Payment error"));
      setPaying(false);
      console.error("confirmPayment error:", err);
    }
    
  }

  return (
    <div>
      <PaymentElement />

      {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}

      <button
        onClick={handlePay}
        disabled={!stripe || !elements || paying}
        className={
          "mt-4 w-full rounded-xl py-4 font-semibold transition " +
          (!stripe || paying ? "bg-white/20 text-white/50" : "bg-white text-black hover:bg-white/90")
        }
      >
        {paying ? "Processing..." : "Pay securely"}
      </button>
    </div>
  );
}

export default function PublicTipCheckout({
  clientSecret,
  receiptUrl,
}: {
  clientSecret: string;
  receiptUrl: string; // absolute URL
}) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  // Dev fallback: if no publishable key is provided (local dev), render a simple
  // mock checkout UI that simulates a successful payment. This avoids runtime
  // Stripe Elements errors when `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not set.
  if (!publishableKey || !stripePromise) {
    return (
      <div>
        <div className="mb-3 text-sm">(Dev mode) Mock payment UI</div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm text-white/70">Payment method preview</div>
          <div className="mt-3">
            <button
              onClick={() => {
                // Simulate immediate success by navigating to the receipt page
                window.location.href = new URL(receiptUrl).pathname;
              }}
              className={
                "mt-4 w-full rounded-xl py-4 font-semibold transition bg-white text-black hover:bg-white/90"
              }
            >
              Pay (mock)
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-white/50">No Stripe publishable key detected — using mock checkout.</div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <InnerCheckout receiptUrl={receiptUrl} />
    </Elements>
  );
}
