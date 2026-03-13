"use client";

import { useState, useMemo } from "react";

const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT = 0.30;

export default function TipBox({ creatorId }: { creatorId: string }) {
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const stripeFee = useMemo(() => {
    if (!amount) return 0;
    return amount * STRIPE_PERCENT + STRIPE_FLAT;
  }, [amount]);

  const total = useMemo(() => {
    return amount + stripeFee;
  }, [amount, stripeFee]);

  async function handleCheckout() {
    setLoading(true);

    const res = await fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipAmount: amount,
        creatorUserId: creatorId,
      }),
    });

    const data = await res.json();

    if (data.clientSecret) {
      // Pass clientSecret to Stripe Elements confirmPayment()
      console.log("Ready to confirm:", data.clientSecret);
    }

    setLoading(false);
  }

  return (
    <div className="p-6 bg-white rounded-2xl border border-gray-200 space-y-4">
      <input
        type="number"
        placeholder="Enter tip amount"
        className="w-full border rounded-lg p-3"
        onChange={(e) => setAmount(Number(e.target.value))}
      />

      {amount > 0 && (
        <div className="text-sm space-y-1 text-gray-600">
          <div className="flex justify-between">
            <span>Tip</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Processing fee</span>
            <span>${stripeFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading || amount <= 0}
        className="w-full bg-black text-white py-3 rounded-xl"
      >
        {loading ? "Processing..." : "Send Tip"}
      </button>
    </div>
  );
}
