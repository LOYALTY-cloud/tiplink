"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type BillingStore = {
  id?: string;
  is_active: boolean;
  billing_type: "balance" | "stripe" | null;
  billing_status?: "active" | "past_due" | "canceled" | string | null;
  grace_until?: string | null;
  renews_at: string | null;
  stripe_subscription_id: string | null;
};

type StoreInvoice = {
  id: string;
  amount: number;
  status: "paid" | "failed" | "pending";
  billing_type: "stripe" | "balance";
  stripe_invoice_id: string | null;
  created_at: string;
  paid_at: string | null;
};

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function StoreBillingCard({ onUpdated }: { onUpdated?: () => Promise<void> | void }) {
  const [store, setStore] = useState<BillingStore | null>(null);
  const [ownerElite, setOwnerElite] = useState(false);
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "stripe" | "balance" | "cancel" | "retry">(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/store/billing", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load billing");
      setStore(json.store ?? null);
      setOwnerElite(json.owner_elite === true);
      setInvoices((json.invoices ?? []) as StoreInvoice[]);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load billing", ok: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runAction(kind: "stripe" | "balance" | "cancel" | "retry", endpoint: string) {
    setBusy(kind);
    setMsg(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");

      if ((kind === "stripe" || kind === "retry") && json.url) {
        window.location.href = json.url;
        return;
      }

      setMsg({
        text:
          kind === "balance"
            ? "Switched to balance billing."
            : kind === "cancel"
            ? "Store canceled."
            : kind === "retry"
            ? "Redirecting to payment retry..."
            : "Billing updated.",
        ok: true,
      });

      await load();
      if (onUpdated) await onUpdated();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Request failed", ok: false });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="h-40 rounded-2xl bg-white/5 animate-pulse" />;
  }

  if (!store) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
        <p className="text-sm text-white/60">No store billing profile yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-white/50">Store Status</p>
          <p className="text-base font-semibold mt-1">{store.is_active ? "Active" : "Inactive"}</p>
        </div>
        <div>
          <p className="text-xs text-white/50">Billing Method</p>
          <p className="text-sm mt-1">
            {ownerElite ? "Owner Elite (No Monthly Fee)" : store.billing_type === "stripe" ? "Card (Auto-renew)" : "Balance"}
          </p>
        </div>
        <div>
          <p className="text-xs text-white/50">Billing Status</p>
          <p className="text-sm mt-1 capitalize">{store.billing_status ?? "active"}</p>
        </div>
        <div>
          <p className="text-xs text-white/50">Next Renewal</p>
          <p className="text-sm mt-1">
            {store.renews_at ? new Date(store.renews_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {store.billing_status === "past_due" && (
        <div className="bg-amber-400/10 border border-amber-400/25 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-300 font-medium">Payment failed</p>
          <p className="text-xs text-amber-200/80 mt-1">
            Your store will be disabled on {store.grace_until ? new Date(store.grace_until).toLocaleDateString() : "the grace-period end date"} unless billing is recovered.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {store.billing_status === "past_due" && store.billing_type === "stripe" && (
          <button
            onClick={() => runAction("retry", "/api/store/retry-payment")}
            disabled={busy !== null}
            className="bg-amber-300 text-black px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {busy === "retry" ? "Loading..." : "Retry Payment"}
          </button>
        )}

        {!ownerElite && store.billing_type !== "stripe" && (
          <button
            onClick={() => runAction("stripe", "/api/store/switch-to-stripe")}
            disabled={busy !== null}
            className="bg-white text-black px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {busy === "stripe" ? "Loading..." : "Switch to Card"}
          </button>
        )}

        {store.billing_type !== "balance" && (
          <button
            onClick={() => runAction("balance", "/api/store/switch-to-balance")}
            disabled={busy !== null}
            className="bg-white/10 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {busy === "balance" ? "Switching..." : "Switch to Balance"}
          </button>
        )}

        <button
          onClick={() => runAction("cancel", "/api/store/cancel")}
          disabled={busy !== null}
          className="bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {busy === "cancel" ? "Canceling..." : "Cancel Store"}
        </button>
      </div>

      <div className="space-y-2 pt-2">
        <p className="text-sm text-white/60">Billing History</p>

        {invoices.length === 0 && (
          <p className="text-xs text-white/40">No billing events yet.</p>
        )}

        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between text-sm bg-white/5 p-3 rounded-xl">
            <div>
              <p>${Number(inv.amount).toFixed(2)} <span className="text-xs text-white/40">({inv.billing_type})</span></p>
              <p className="text-xs text-white/40">
                {new Date(inv.created_at).toLocaleDateString()}
              </p>
              {inv.stripe_invoice_id && (
                <a
                  href={`https://dashboard.stripe.com/invoices/${inv.stripe_invoice_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-300 hover:text-blue-200 underline"
                >
                  View Invoice
                </a>
              )}
            </div>

            <span className={
              inv.status === "paid"
                ? "text-green-400"
                : inv.status === "failed"
                ? "text-red-400"
                : "text-amber-300"
            }>
              {inv.status}
            </span>
          </div>
        ))}
      </div>

      {msg && (
        <p className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
