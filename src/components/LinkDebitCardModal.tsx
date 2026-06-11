"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
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
    const cardElement = elements?.getElement(CardElement);
    if (!stripe || !cardElement) return;

    setLoading(true);

    // Create a token from the card element — gives us tok_xxx
    // Must be a debit card; Stripe rejects credit cards as payout external accounts
    const { token, error } = await stripe.createToken(cardElement);

    if (error) {
      setLoading(false);
      setMsg(error.message ?? "Card verification failed.");
      return;
    }

    if (!token?.id) {
      setLoading(false);
      setMsg("No token returned from card.");
      return;
    }

    // Reject credit cards before hitting the server — Stripe won't accept them as payout accounts
    if (token.card?.funding && token.card.funding !== "debit") {
      setLoading(false);
      setMsg("Only debit cards are accepted for payouts. Please enter a Visa or Mastercard debit card.");
      return;
    }

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setLoading(false);
      setMsg("Not logged in.");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const authToken = sess.session?.access_token;
    if (!authToken) {
      setLoading(false);
      setMsg("Session expired.");
      return;
    }

    const r = await fetch("/api/stripe/store-payout-method", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ token: token.id }),
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
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#32325d',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#fa755a',
              },
            },
          }}
        />
      </div>

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      <button
        onClick={submit}
        disabled={!stripe || loading}
        className="w-full rounded-xl bg-gray-900 text-white py-3 font-semibold hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Linking..." : "Link debit card"}
      </button>

      <div className="text-xs text-gray-500">
        Card details are handled by Stripe. 1NELINK never stores full card numbers or CVV.
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
    // Just set a dummy value to load Elements — we don't need a SetupIntent for token-based flow
    setClientSecret("placeholder");
  }, [open]);

  const options = useMemo(
    () =>
      clientSecret
        ? {
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
