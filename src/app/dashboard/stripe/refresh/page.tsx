"use client";

import { useEffect } from "react";
import { ui } from "@/lib/ui";

export default function StripeRefreshPage() {
  useEffect(() => {
    // Just send them back to the connect button to restart
    window.location.href = "/dashboard";
  }, []);

  return (
    <div className={`${ui.card} p-6`}>
      <h1 className={ui.h2}>Link expired</h1>
      <p className={`mt-2 ${ui.muted}`}>Redirecting…</p>
    </div>
  );
}
