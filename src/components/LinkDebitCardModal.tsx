"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { supabase } from "@/lib/supabase/client";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function Inner({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    if (!stripe || !elements) return;

    setLoading(true);

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard/wallet`,
      },
      redirect: "if_required",
    });

    if (error) {
      setLoading(false);
      setMsg(error.message ?? "Card verification failed.");
      return;
    }

    const pmId = (setupIntent as any)?.payment_method as string | undefined;
    if (!pmId) {
      setLoading(false);
      setMsg("No payment method returned.");
      return;
    }

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setLoading(false);
      setMsg("Not logged in.");
      return;
    }

    const r = await fetch("/api/stripe/store-payout-method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, paymentMethodId: pmId }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setLoading(false);
      setMsg(j?.error ?? "Could not save payout method.");
      return;
    }

    setLoading(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <PaymentElement />
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <button
        onClick={submit}
        disabled={!stripe || !elements || loading}
        className="w-full rounded-xl bg-gray-900 text-white py-3 font-semibold hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Linking..." : "Link debit card"}
      </button>

      <div className="text-xs text-gray-500">
        Card details are handled by Stripe. TIPLINK never stores full card numbers or CVV.
      </div>
    </div>
  );
}

export default function LinkDebitCardModal({
  open,
  onClose,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const r = await fetch("/api/stripe/setup-intent", { method: "POST" });
      if (!r.ok) {
        setClientSecret(null);
        return;
      }

      const text = await r.text();
      if (!text) {
        setClientSecret(null);
        return;
      }

      const j = JSON.parse(text) as { clientSecret?: string };
      setClientSecret(j.clientSecret ?? null);
    })();
  }, [open]);

  const options = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: { theme: "stripe" as const },
          }
        : undefined,
    [clientSecret]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Link debit card</div>
            <div className="text-sm text-gray-600 mt-1">Required for instant withdrawals.</div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            x
          </button>
        </div>

        <div className="mt-4">
          {!clientSecret || !options ? (
            <div className="text-sm text-gray-600">Loading secure card form...</div>
          ) : (
            <Elements stripe={stripePromise} options={options}>
              <Inner
                onDone={() => {
                  onLinked();
                  onClose();
                }}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
