"use client";

import { useEffect, useState } from "react";
import StripeEmbeddedOnboarding from "@/components/StripeEmbeddedOnboarding";
import { supabase } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) throw new Error("Not authenticated");

        const res = await fetch("/api/stripe/connect/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id }),
        });

        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Could not create session");
        if (!mounted) return;
        setClientSecret(j.client_secret || "");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }

    loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <p>Loading onboarding...</p>;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (!clientSecret) return <p>No onboarding session available.</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Activate your payouts</h1>

      <StripeEmbeddedOnboarding clientSecret={clientSecret} />
    </div>
  );
}
