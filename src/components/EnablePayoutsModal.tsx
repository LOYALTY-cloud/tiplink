"use client";

import { useState } from "react";

export function EnablePayoutsModal({
  open,
  onClose,
  onEnable,
  balanceText,
}: {
  open: boolean;
  onClose: () => void;
  onEnable: () => Promise<void>;
  balanceText: string; // e.g. "$247.00"
}) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-gray-500">TIPLINKME</div>
            <h2 className="text-xl font-semibold text-gray-900">Enable payouts to withdraw</h2>
            <p className="mt-2 text-sm text-gray-600">
              To send your earnings to your bank, we use Stripe — a trusted payout provider.
              Stripe handles identity + bank details securely. TIPLINKME never stores your SSN or bank info.
            </p>
          </div>

          <button
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs text-gray-500">Available balance</div>
          <div className="text-2xl font-semibold text-gray-900">{balanceText}</div>
          <div className="mt-1 text-xs text-gray-500">Takes about 2–3 minutes</div>
        </div>

        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onEnable();
            } finally {
              setLoading(false);
            }
          }}
          className="mt-5 w-full rounded-xl bg-gray-900 text-white py-3 font-semibold hover:bg-gray-800 disabled:opacity-60"
        >
          {loading ? "Opening Stripe…" : "Enable payouts with Stripe"}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 font-semibold text-gray-900 hover:bg-gray-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
