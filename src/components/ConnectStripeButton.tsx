"use client";

import { useRouter } from "next/navigation";

export function ConnectStripeButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push("/dashboard/onboarding")}
      className="rounded-xl bg-gray-900 text-white px-4 py-3 font-semibold hover:bg-gray-800"
    >
      Connect Stripe
    </button>
  );
}
