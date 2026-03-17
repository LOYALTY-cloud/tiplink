"use client";

import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement
} from "@stripe/react-stripe-js";

export default function CardDetails() {
  return (
    <div className="bg-black/30 p-4 rounded-lg space-y-4">

      <div>
        <p className="text-xs text-white/60 mb-1">Card Number</p>
        <div className="bg-black p-3 rounded">
          <CardNumberElement />
        </div>
      </div>

      <div className="flex gap-4">

        <div className="flex-1">
          <p className="text-xs text-white/60 mb-1">Expiry</p>
          <div className="bg-black p-3 rounded">
            <CardExpiryElement />
          </div>
        </div>

        <div className="flex-1">
          <p className="text-xs text-white/60 mb-1">CVC</p>
          <div className="bg-black p-3 rounded">
            <CardCvcElement />
          </div>
        </div>

      </div>

    </div>
  );
}
