"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseAdmin as supabase } from "@/lib/supabase/adminBrowserClient";
import { ui } from "@/lib/ui";

type DisputedTip = {
  receipt_id: string;
  creator_user_id: string;
  tip_amount: number;
  refunded_amount: number;
  refund_status: string;
  stripe_payment_intent_id: string | null;
  status: string;
  created_at: string;
};

type Severity = "HIGH" | "MEDIUM" | "LOW";

function getSeverity(count: number): Severity {
  if (count >= 3) return "HIGH";
  if (count >= 1) return "MEDIUM";
  return "LOW";
}

function severityStyle(s: Severity) {
  switch (s) {
    case "HIGH":
      return "text-red-400 bg-red-500/10 border-red-400/20";
    case "MEDIUM":
      return "text-yellow-400 bg-yellow-500/10 border-yellow-400/20";
    case "LOW":
      return "text-green-400 bg-green-500/10 border-green-400/20";
  }
}

export default function AdminDisputesPage() {
  const [tips, setTips] = useState<DisputedTip[]>([]);
  const [creatorCounts, setCreatorCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Record<string, { handle: string | null; display_name: string | null }>>({});

  useEffect(() => {
    fetchDisputes();

    const channel = supabase
      .channel("admin-disputes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tip_intents", filter: "status=eq.disputed" }, () => {
        fetchDisputes();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchDisputes() {
    setLoading(true);
    const { data } = await supabase
      .from("tip_intents")
      .select(
        "receipt_id, creator_user_id, tip_amount, refunded_amount, refund_status, stripe_payment_intent_id, status, created_at"
      )
      .eq("status", "disputed")
      .order("created_at", { ascending: false })
      .limit(100);

    const disputes = data ?? [];
    setTips(disputes);

    // Count disputes per creator
    const counts: Record<string, number> = {};
    for (const d of disputes) {
      counts[d.creator_user_id] = (counts[d.creator_user_id] ?? 0) + 1;
    }
    setCreatorCounts(counts);

    // Batch-fetch profiles for all creator IDs
    const ids = [...new Set(disputes.map((d) => d.creator_user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);
      const map: Record<string, { handle: string | null; display_name: string | null }> = {};
      for (const p of profiles ?? []) {
        map[p.user_id] = { handle: p.handle, display_name: p.display_name };
      }
      setProfileMap(map);
    }

    setLoading(false);
  }

  function userLabel(id: string) {
    const p = profileMap[id];
    if (p?.handle) return `@${p.handle}`;
    if (p?.display_name) return p.display_name;
    return `${id.slice(0, 8)}…`;
  }

  return (
    <div className="space-y-4">
      <h1 className={ui.h1}>Disputes</h1>

      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : tips.length === 0 ? (
        <div className={`${ui.card} p-6 text-center`}>
          <p className="text-green-400 font-semibold">No active disputes</p>
          <p className={`text-sm ${ui.muted2} mt-1`}>
            Chargebacks will appear here when Stripe fires a <code>charge.dispute.created</code> event.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tips.map((t) => {
            const count = creatorCounts[t.creator_user_id] ?? 1;
            const severity = getSeverity(count);
            return (
              <div key={t.receipt_id} className={`${ui.card} p-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      Tip {t.receipt_id.slice(0, 8)}…
                      <span className={`ml-2 text-xs ${ui.muted2}`}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </p>
                    <p className={`text-xs ${ui.muted}`}>
                      Amount: ${Number(t.tip_amount).toFixed(2)} ·{" "}
                      <Link
                        href={`/admin/users/${t.creator_user_id}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {userLabel(t.creator_user_id)}
                      </Link>
                    </p>
                    {t.stripe_payment_intent_id && (
                      <p className={`text-xs ${ui.muted2} truncate`}>
                        PI: {t.stripe_payment_intent_id}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold border rounded-full px-3 py-1 ${severityStyle(severity)}`}>
                      {severity} ({count})
                    </span>
                    <span className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-400/20 rounded-full px-3 py-1">
                      Disputed
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
