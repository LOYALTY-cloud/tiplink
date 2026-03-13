"use client";

import { supabase } from "@/lib/supabase/client";

export function ConnectStripeButton() {
  const onConnect = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return alert("Please log in.");

    const res = await fetch("/api/stripe/connect/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });

    const json = await res.json();
    if (!res.ok) return alert(json.error || "Failed to start onboarding");

    window.location.href = json.url; // send to Stripe onboarding
  };

  return (
    <button
      onClick={onConnect}
      className="rounded-xl bg-gray-900 text-white px-4 py-3 font-semibold hover:bg-gray-800"
    >
      Connect Stripe
    </button>
  );
}
