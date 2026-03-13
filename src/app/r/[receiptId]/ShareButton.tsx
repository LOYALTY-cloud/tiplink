"use client";

import { useState } from "react";

export function ShareButton({ receiptId }: { receiptId: string }) {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/r/${encodeURIComponent(receiptId)}`;
    
      try {
        if (typeof navigator !== "undefined" && (navigator as any).share && (navigator as any).canShare && (navigator as any).canShare({ url })) {
          try {
            await (navigator as any).share({
              title: "TipLink Receipt",
              text: `Receipt for your support - ${receiptId}`,
              url: url,
            });
            setShared(true);
            setTimeout(() => setShared(false), 2000);
            return;
          } catch (shareErr) {
            if (shareErr instanceof Error && shareErr.name === "AbortError") return;
          }
        }

        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setShared(true);
          setTimeout(() => setShared(false), 2000);
        } else {
          prompt("Copy this receipt link:", url);
        }
      } catch (err) {
        console.error("Failed to share:", err);
        prompt("Copy this receipt link:", url);
      }
  };

  return (
    <div className="mt-4">
      <button
        className={`w-full rounded-xl py-3 font-semibold transition-colors ${
          shared
            ? "bg-emerald-600 text-white"
            : "bg-gray-900 text-white hover:bg-gray-800"
        }`}
        onClick={handleShare}
        disabled={shared}
      >
        {shared ? "✅ Shared!" : "Share receipt"}
      </button>
    </div>
  );
}
