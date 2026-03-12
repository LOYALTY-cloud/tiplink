"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/lib/useToast";

const RETRY_KEY = "tiplink:card_onboard_retry";

async function enqueueOnboard(userId: string) {
  const res = await fetch("/api/stripe/onboard-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("enqueue failed");
  return res.json();
}

function getRetryCount(userId: string) {
  try {
    const raw = localStorage.getItem(`${RETRY_KEY}:${userId}`);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function setRetryCount(userId: string, n: number) {
  try {
    localStorage.setItem(`${RETRY_KEY}:${userId}`, String(n));
  } catch {}
}

export default function VerifiedUserHandler() {
  const toast = useToast(5000);

  useEffect(() => {
    let mounted = true;

    async function ensureCardForUser(user: any) {
      if (!user) return;
      const isConfirmed = Boolean((user as any).confirmed_at || (user as any).email_confirmed_at || (user as any).email_confirmed);
      if (!isConfirmed) return;

      try {
        const { data: prof } = await supabase.from("profiles").select("stripe_card_id").eq("user_id", user.id).maybeSingle();
        if (prof?.stripe_card_id) return;

        try {
          // Enqueue onboarding; server worker will perform the actual onboarding
          await enqueueOnboard(user.id);
          toast.show("Virtual card creation queued");
          setRetryCount(user.id, 0);
        } catch (err) {
          const current = getRetryCount(user.id);
          const next = current + 1;
          setRetryCount(user.id, next);
          toast.show("Your virtual card couldn’t be created. We will retry automatically.");

          // schedule retry (exponential-ish backoff)
          const delays = [30000, 120000, 300000, 900000, 1800000];
          const delay = delays[Math.min(current, delays.length - 1)];
          setTimeout(() => {
            if (!mounted) return;
            ensureCardForUser(user);
          }, delay);
        }
      } catch (err) {
        // ignore
      }
    }

    // Run once on mount
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = (data as any)?.user;
      if (user) ensureCardForUser(user);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const user = (session as any)?.user;
      if (user) ensureCardForUser(user);
    });

    return () => {
      mounted = false;
      try { sub.subscription.unsubscribe(); } catch {}
    };
  }, [toast]);

  return null;
}
