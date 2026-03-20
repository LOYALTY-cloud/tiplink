"use client";

import { ui } from "@/lib/ui";

export default function VirtualCardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className={ui.card + " p-8 text-center max-w-md"}>
        <h1 className="text-xl font-bold mb-2">Virtual Card</h1>
        <p className={ui.muted}>Coming soon. This feature is temporarily unavailable.</p>
      </div>
    </div>
  );
}
