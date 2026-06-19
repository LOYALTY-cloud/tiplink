"use client";

import { useEffect, useRef, useState } from "react";
import type { StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectAccountManagement,
} from "@stripe/react-connect-js";

/**
 * Renders Stripe Connect embedded onboarding/management inside the app.
 * Uses @stripe/connect-js v3 + @stripe/react-connect-js — no redirect to stripe.com.
 *
 * fetchClientSecret must call your backend to return a fresh cacs_… token each
 * invocation — Stripe calls it on init and on session refresh, and reusing a
 * previously-returned secret causes an "authentication error".
 *
 * The connect instance is created inside useEffect so it never runs during SSR.
 * Importing from @stripe/connect-js/pure avoids the auto-script-injection side-effect.
 */
export default function StripeEmbeddedOnboarding({
  fetchClientSecret,
  mode = "onboarding",
  onRetry,
  onExit,
}: {
  fetchClientSecret: () => Promise<string>;
  mode?: "onboarding" | "manage";
  onRetry?: () => void;
  onExit?: () => void;
}) {
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Always keep a ref to the latest fetchClientSecret so Stripe's callback
  // never closes over a stale function reference.
  const fetchClientSecretRef = useRef(fetchClientSecret);
  fetchClientSecretRef.current = fetchClientSecret;

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setInitError("Stripe configuration error. Please contact support.");
      return;
    }

    // Import from pure to avoid SSR script-injection side-effects
    import("@stripe/connect-js/pure")
      .then(({ loadConnectAndInitialize }) => {
        const instance = loadConnectAndInitialize({
          publishableKey,
          // Delegate through the ref so every Stripe-initiated call (initial auth
          // and any subsequent token refresh) hits the backend for a fresh secret.
          fetchClientSecret: () => fetchClientSecretRef.current(),
          // Load Inter inside the iframe — Geist (our brand font) is a Vercel font
          // not available on Google Fonts CDN, so Inter is the closest match.
          fonts: [
            { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
          ],
          appearance: {
            variables: {
              // ── Core brand colors (matches --bg0 / --blue / --text CSS vars) ──
              colorPrimary:          "#3B82F6",  // --blue
              colorBackground:       "#050A1A",  // --bg0 (exact brand deep navy)
              colorText:             "#EAEAF2",  // ~rgba(255,255,255,0.92)
              colorSecondaryText:    "#A8ABBE",  // ~rgba(255,255,255,0.65)
              colorDanger:           "#EF4444",

              // ── Typography ──
              fontFamily:    "Inter, system-ui, -apple-system, sans-serif",
              fontSizeBase:  "14px",

              // ── Shape — mirrors rounded-xl (12px) + spacing ──
              borderRadius:  "12px",
              spacingUnit:   "10px",

              // ── Borders — matches --border rgba(255,255,255,0.10) ──
              colorBorder:   "#1A1F2E",

              // ── Form fields — blue focus ring + accent (checkboxes/radios) ──
              formHighlightColorBorder: "#3B82F6",
              formAccentColor:          "#3B82F6",

              // ── Primary button — matches bg-gradient blue ──
              buttonPrimaryColorBackground: "#3B82F6",
              buttonPrimaryColorBorder:     "#2563EB",  // --blue2
              buttonPrimaryColorText:       "#FFFFFF",

              // ── Secondary / ghost button — matches bg-white/[0.06] + border-white/[0.12] ──
              buttonSecondaryColorBackground: "#0D1221",
              buttonSecondaryColorBorder:     "#1C2132",
              buttonSecondaryColorText:       "#D9DAE8",

              // ── Links ──
              actionPrimaryColorText:   "#60A5FA",  // blue-400 (better contrast on dark)
              actionSecondaryColorText: "#A8ABBE",

              // ── Success badge — matches green-500/15 + green-300 text ──
              badgeSuccessColorBackground: "#0D2318",
              badgeSuccessColorText:       "#86EFAC",
              badgeSuccessColorBorder:     "#1A4A2E",

              // ── Warning badge ──
              badgeWarningColorBackground: "#211A08",
              badgeWarningColorText:       "#FDE047",
              badgeWarningColorBorder:     "#42350F",

              // ── Danger badge ──
              badgeDangerColorBackground:  "#200D0D",
              badgeDangerColorText:        "#FCA5A5",
              badgeDangerColorBorder:      "#3D1515",

              // ── Neutral badge ──
              badgeNeutralColorBackground: "#0D1221",
              badgeNeutralColorText:       "#A8ABBE",
              badgeNeutralColorBorder:     "#1C2132",
            },
          },
        });
        setConnectInstance(instance);
      })
      .catch((e) => {
        setInitError(e instanceof Error ? e.message : "Failed to initialize Stripe");
      });
  // Run once on mount — the ref always has the latest fetchClientSecret.
  }, []);

  useEffect(() => {
    // User input inside Stripe's iframe does not always bubble to the parent
    // window, so keep the dashboard inactivity timer alive while this embed is open.
    const heartbeat = window.setInterval(() => {
      window.dispatchEvent(new Event("session_activity"));
    }, 20_000);

    return () => {
      window.clearInterval(heartbeat);
    };
  }, []);

  if (initError) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200 space-y-3">
        <p>{initError}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-600 text-white px-4 py-2 text-xs font-medium hover:bg-red-700 transition"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (!connectInstance) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/70 py-6">
        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <span>Loading secure onboarding…</span>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <div className="min-h-[320px]">
        {mode === "manage" ? (
          <ConnectAccountManagement />
        ) : (
          <ConnectAccountOnboarding onExit={() => { void onExit?.(); }} />
        )}
      </div>
    </ConnectComponentsProvider>
  );
}
