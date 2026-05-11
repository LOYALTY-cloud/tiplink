"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
const StripeEmbeddedOnboarding = dynamic(
  () => import("./StripeEmbeddedOnboarding"),
  { ssr: false },
);
import { supabase } from "@/lib/supabase/client";

export default function StripeVerificationModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) {
  // Increment to force-remount the Stripe component on retry
  const [retryKey, setRetryKey] = useState(0);

  /**
   * Called by Stripe on mount and on every session-token refresh.
   * Must return a *fresh* cacs_… secret each call — reusing a previously-returned
   * secret results in an "authentication error" inside the iframe.
   */
  const fetchStripeSecret = useCallback(async (): Promise<string> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("/api/stripe/connect/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      // Use onboarding mode — account_management does NOT surface tos_acceptance
      // or other missing requirements that users need to complete.
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((j.error as string) || "Could not load verification");
    const secret = j.client_secret as string | undefined;
    if (!secret) throw new Error("No session returned");
    return secret;
  }, []);

  const handleClose = () => {
    onClose();
    onComplete?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Complete Your Verification</h2>
            <p className="text-sm text-blue-100 mt-1">
              Provide the required information to enable payouts
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Content — StripeEmbeddedOnboarding handles its own loading and error states */}
        <div className="bg-gray-50 p-6 min-h-[500px] max-h-[80vh] overflow-y-auto">
          <div className="bg-white rounded-xl p-4">
            <StripeEmbeddedOnboarding
              key={retryKey}
              fetchClientSecret={fetchStripeSecret}
              mode="onboarding"
              onRetry={() => setRetryKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            💡 All information is encrypted and processed securely through Stripe. Your data is protected.
          </p>
        </div>
      </div>
    </div>
  );
}

