"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";

export default function StripeReturnPage() {
  const router = useRouter();

  useEffect(() => {
    // Legacy redirect page — embedded onboarding no longer uses this route.
    // Redirect to the embedded onboarding page in case anyone lands here.
    router.replace("/dashboard/onboarding");
  }, [router]);

  return (
    <div className={`${ui.card} p-6`}>
      <h1 className={ui.h2}>Stripe setup complete</h1>
      <p className={`mt-2 ${ui.muted}`}>Redirecting…</p>
    </div>
  );
}
