"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import CardDetails from "@/components/CardDetails";

type Tx = { id: string; merchant_data?: { name?: string }; amount: number };

type CardInfo = {
  id?: string;
  brand?: string;
  last4?: string;
  cardholder_name?: string;
  exp_month?: number;
  exp_year?: number;
  status?: string;
};

type EphemeralKey = { secret: string };

export default function VirtualCardPage() {
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [ephemeralKey, setEphemeralKey] = useState<EphemeralKey | null>(null);

  const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_card_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<import("@/types/db").ProfileRow | null>();

      if (prof && prof.stripe_card_id) {
        const id = prof.stripe_card_id as string;
        setCardId(id);
        await fetchCard(id);
        await fetchTransactions(id);
      }
    })();
  }, []);

  async function createCardholder() {
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) throw new Error("Not authenticated");

      const res = await fetch("/api/stripe/create-cardholder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: user.user_metadata?.full_name || user.email, email: user.email }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // cardholder saved server-side to profile
      return json;
    } finally {
      setLoading(false);
    }
  }

  async function createCard() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCardId(json.id);
      setCardInfo(json);
      await fetchTransactions(json.id);
      return json;
    } finally {
      setLoading(false);
    }
  }

  async function initEphemeralKey(id: string) {
    try {
      const res = await fetch("/api/stripe/ephemeral-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEphemeralKey(json);
    } catch (e) {
      console.error("ephemeral key error", e);
      alert(String(e));
    }
  }

  async function fetchCard(id: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/get-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCardInfo(json);
      return json;
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions(id: string) {
    try {
      const res = await fetch("/api/stripe/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTransactions(json as Tx[]);
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleFreeze() {
    if (!cardId) return alert("No card");
    setLoading(true);
    try {
      const action = cardInfo?.status === "active" ? "freeze" : "unfreeze";
      const res = await fetch("/api/stripe/freeze-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCardInfo(json);
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setLoading(false);
    }
  }

  function copyNumber() {
    const last4 = cardInfo?.last4 || "0000";
    const masked = `•••• •••• •••• ${last4}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(masked);
    }
    alert("Copied: " + masked);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Virtual Card</h1>

      <div className="bg-black text-white rounded-2xl p-6 shadow-lg space-y-6">
        <div className="flex justify-between">
          <span className="text-sm opacity-70">Your Card</span>
          <span className="font-bold">{((cardInfo?.brand || "VISA").toUpperCase())}</span>
        </div>

        <div className="text-xl tracking-widest">
          {cardId ? (revealed ? `•••• •••• •••• ${cardInfo?.last4 || "0000"}` : "•••• •••• •••• ••••") : "No card issued"}
        </div>

        <div className="flex justify-between text-sm">
          <div>
            <p className="opacity-60">Cardholder</p>
            <p>{cardInfo?.cardholder_name || "You"}</p>
          </div>

          <div>
            <p className="opacity-60">Expires</p>
            <p>{cardInfo ? `${cardInfo.exp_month ?? "••"}/${cardInfo.exp_year ? String(cardInfo.exp_year).slice(-2) : "••"}` : "--"}</p>
          </div>

          <div>
            <p className="opacity-60">Status</p>
            <p className={cardInfo?.status === "active" ? "text-green-400" : "text-red-400"}>{cardInfo?.status || "--"}</p>
          </div>
        </div>
        {cardId && revealed && (
          <div className="mt-3">
            {/* Stripe Elements Issuing Element (secure PAN reveal) */}
            {ephemeralKey ? (
              <Elements stripe={stripePromise} options={{ clientSecret: ephemeralKey?.secret ?? "" }}>
                <CardDetails />
              </Elements>
            ) : (
              <div className="text-sm text-white/60">Initializing secure reveal…</div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        {!cardInfo && (
          <button onClick={createCardholder} className="px-4 py-2 rounded-lg bg-blue-600 text-white" disabled={loading}>
            Create Cardholder
          </button>
        )}

        {!cardId && (
          <button onClick={createCard} className="px-4 py-2 rounded-lg border" disabled={loading}>
            Create Card
          </button>
        )}

        {cardId && (
          <>
            <button
              onClick={async () => {
                if (!revealed) {
                  await initEphemeralKey(cardId);
                }
                setRevealed(!revealed);
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white"
            >
              {revealed ? "Hide Details" : "Reveal Card"}
            </button>

            <button onClick={toggleFreeze} className="px-4 py-2 rounded-lg border">
              {cardInfo?.status === "active" ? "Freeze Card" : "Unfreeze Card"}
            </button>

            <button onClick={copyNumber} className="px-4 py-2 rounded-lg border">
              Copy Number
            </button>
          </>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Transactions</h2>
        <div className="space-y-3">
          {transactions.length === 0 && <div className="text-sm text-white/60">No transactions</div>}
          {transactions.map((tx) => (
            <div key={tx.id} className="flex justify-between border p-3 rounded-lg">
              <span>{tx.merchant_data?.name || "Unknown"}</span>
              <span>${(tx.amount / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
