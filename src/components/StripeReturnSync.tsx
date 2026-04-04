"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export function StripeReturnSync() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const stripeState = params.get("stripe");
      if (stripeState !== "return") return;

      (async () => {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) return;

        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;

        await fetch("/api/stripe/connect/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });

        // clean URL + refresh
        window.location.replace("/dashboard");
      })();
    } catch (e) {
      // ignore during prerender
    }
  }, []);

  return null;
}
