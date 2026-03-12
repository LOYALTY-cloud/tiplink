"use client";

import { useState } from "react";

export function ShareButton({ receiptId }: { receiptId: string }) {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/r/${encodeURIComponent(receiptId)}`;
    
    try {
      // Try Web Share API first (only works on mobile/HTTPS contexts with user gesture)
      if (navigator.share && navigator.canShare && navigator.canShare({ url })) {
        try {
          await navigator.share({
            title: "TipLink Receipt",
            text: `Receipt for your support - ${receiptId}`,
            url: url,
          });
          setShared(true);
          setTimeout(() => setShared(false), 2000);
          return;
        } catch (shareErr) {
          // If share fails or user cancels, fall through to clipboard
          if (shareErr instanceof Error && shareErr.name === "AbortError") {
            return; // User cancelled, don't show error
          }
        }
      }
      
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err) {
      console.error("Failed to share:", err);
      // Final fallback: show URL in prompt
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
