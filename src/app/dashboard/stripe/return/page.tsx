"use client";

import { useEffect } from "react";
import { ui } from "@/lib/ui";

export default function StripeReturnPage() {
  useEffect(() => {
    // Redirect back to wallet after successful Stripe Connect onboarding
    const timer = setTimeout(() => {
      window.location.href = "/dashboard/wallet";
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`${ui.card} p-6`}>
      <h1 className={ui.h2}>Stripe setup complete</h1>
      <p className={`mt-2 ${ui.muted}`}>Redirecting you back to your wallet...</p>
    </div>
  );
}
