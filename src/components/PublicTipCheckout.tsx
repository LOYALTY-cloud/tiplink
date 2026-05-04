"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function SuccessOverlay({ amount, onDone }: { amount?: number; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-[fadeIn_0.3s_ease]">
      <div className="text-center px-6 animate-[celebratePop_0.5s_ease]">
        {/* Animated checkmark circle */}
        <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" className="animate-[drawCheck_0.5s_ease_0.3s_both]" />
          </svg>
        </div>

        <div className="text-white text-2xl font-bold">Tip Sent!</div>
        {amount ? (
          <div className="text-emerald-400 text-3xl font-bold mt-2 animate-[moneyPop_0.4s_ease_0.3s_both]">
            ${amount.toFixed(2)}
          </div>
        ) : null}
        <div className="text-white/50 text-sm mt-3">Thank you for your support 💚</div>

        <button
          onClick={onDone}
          className="mt-6 px-8 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition active:scale-[0.97]"
        >
          View Receipt
        </button>
      </div>
    </div>
  );
}

function InnerCheckout({
  receiptUrl,
  tipAmount,
}: {
  receiptUrl: string;
  tipAmount?: number;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
          return_url: receiptUrl,
        },
      });

      if (res.error) {
        setError(res.error.message || "Payment failed");
        setPaying(false);
        return;
      }

      // Show success animation before redirecting
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err ?? "Payment error"));
      setPaying(false);
      console.error("confirmPayment error:", err);
    }
  }

  if (success) {
    return (
      <SuccessOverlay
        amount={tipAmount}
        onDone={() => router.push(new URL(receiptUrl).pathname)}
      />
    );
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
          (!stripe || paying ? "bg-white/20 text-white/50" : "bg-white text-black hover:bg-white/90 active:scale-[0.98]")
        }
      >
        {paying ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Processing…
          </span>
        ) : "Pay securely"}
      </button>
    </div>
  );
}

export default function PublicTipCheckout({
  clientSecret,
  receiptUrl,
  tipAmount,
}: {
  clientSecret: string;
  receiptUrl: string;
  tipAmount?: number;
}) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  if (!publishableKey || !stripePromise) {
    return (
      <div>
        <div className="mb-3 text-sm">(Dev mode) Mock payment UI</div>
        <div className="rounded-xl bg-white/5 border border-white/[0.12] p-4">
          <div className="text-sm text-white/70">Payment method preview</div>
          <div className="mt-3">
            <button
              onClick={() => {
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
      <InnerCheckout receiptUrl={receiptUrl} tipAmount={tipAmount} />
    </Elements>
  );
}
