"use client";

import { useState } from "react";
import StripeEmbeddedOnboarding from "./StripeEmbeddedOnboarding";
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
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Load account management session when modal opens
  if (!clientSecret && loading) {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        const token = sess.session?.access_token;
        if (!user || !token) throw new Error("Not authenticated");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch("/api/stripe/connect/session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ mode: "manage" }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not load verification");
        setClientSecret(j.client_secret || "");
        setError(null);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }

  const handleClose = () => {
    setClientSecret("");
    setLoading(true);
    setError(null);
    onClose();
    onComplete?.();
  };

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
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="bg-gray-50 p-6 min-h-[500px] max-h-[80vh] overflow-y-auto">
          {loading && !clientSecret && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-600">Loading verification form...</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-800 font-semibold">Failed to Load</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              <button
                onClick={() => {
                  setClientSecret("");
                  setLoading(true);
                  setError(null);
                }}
                className="mt-3 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 transition"
              >
                Try Again
              </button>
            </div>
          )}

          {clientSecret && (
            <div className="bg-white rounded-xl p-4">
              <StripeEmbeddedOnboarding clientSecret={clientSecret} mode="manage" />
            </div>
          )}
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
