"use client";

import { CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useEffect } from "react";

export default function CardDetails() {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    // Elements is initialized by the parent with the ephemeral key via Elements options.
    // Nothing else required here — the IssuingCardNumberElement will render securely.
  }, [stripe, elements]);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-white/80">Card Number</label>
        <div className="mt-2 p-3 bg-white/5 rounded-lg">
          <CardNumberElement />
        </div>
      </div>
    </div>
  );
}
