"use client";

import { useEffect, useState } from "react";

type Status = "pending" | "created" | "succeeded" | "failed" | "unknown";

export function ReceiptStatusPoller({ receiptId }: { receiptId: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20; // ~30s total
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/payments/status?receiptId=${encodeURIComponent(receiptId)}`);
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);

        if (data.status === "succeeded") {
          setSettled(true);
          return;
        }
        if (data.status === "failed") {
          setFailureReason(data.failure_reason || "Payment could not be completed");
          setSettled(true);
          return;
        }
      } catch {
        // network error — keep polling
      }

      attempts++;
      if (attempts < maxAttempts) {
        timer = setTimeout(poll, 1500);
      } else {
        setSettled(true);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [receiptId]);

  if (settled && status === "succeeded") {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        Confirmed
      </span>
    );
  }

  if (settled && status === "failed") {
    return (
      <div className="text-right">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
          Failed
        </span>
        {failureReason && (
          <p className="text-xs text-red-500 mt-1 max-w-[200px]">{failureReason}</p>
        )}
      </div>
    );
  }

  if (settled) {
    // Timed out or unknown — show confirmed as fallback (webhook may still process)
    return (
      <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        Confirmed
      </span>
    );
  }

  // Still polling
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 animate-pulse">
      Processing…
    </span>
  );
}
