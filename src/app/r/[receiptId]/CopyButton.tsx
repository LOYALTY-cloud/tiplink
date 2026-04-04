"use client";

import { useState } from "react";

export function CopyButton({ receiptId }: { receiptId: string }) {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/r/${encodeURIComponent(receiptId)}`;
    
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: "1neLink Receipt",
          text: `Receipt for your support - ${receiptId}`,
          url: url,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch (err) {
      // User cancelled share or error occurred
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Failed to share:", err);
        alert("Failed to share. Please try again.");
      }
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
