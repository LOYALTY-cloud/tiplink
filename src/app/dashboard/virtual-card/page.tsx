"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import dynamic from "next/dynamic";
const CardDetails = dynamic(
  () => import("../../../components/CardDetails"),
  { ssr: false, loading: () => <p className="text-sm">Loading card UI…</p> }
);

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type Transaction = {
  id: string;
  merchant_data?: { name?: string };
  amount: number;
};

type CardInfo = {
  id?: string;
  brand?: string;
  last4?: string;
  cardholder_name?: string;
  exp_month?: number;
  exp_year?: number;
  status?: string;
};

type EphemeralKey = {
  secret: string;
};

export default function VirtualCardPage() {
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [user, setUser] = useState<any>(null);

  const [cardId, setCardId] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ephemeralKey, setEphemeralKey] = useState<EphemeralKey | null>(null);

  useEffect(() => {
    async function loadUserAndInit() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user || null);

      await initialize();
    }

    loadUserAndInit();
  }, []);

  async function initialize() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_card_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.stripe_card_id) {
      const id = profile.stripe_card_id;

      setCardId(id);

      await fetchCard(id);
      await fetchTransactions(id);
    }
  }

  async function createCardholder() {
    try {
      setLoading(true);

      const currentUser =
        user ?? (await supabase.auth.getSession()).data.session?.user;

      if (!currentUser) {
        alert("Please sign in to create a cardholder");
        return;
      }

      const res = await fetch("/api/stripe/create-cardholder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name:
            currentUser.user_metadata?.full_name || currentUser.email,
          email: currentUser.email,
        }),
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function createCard() {
    try {
      setLoading(true);

      const res = await fetch("/api/stripe/create-card", {
        method: "POST",
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);

      setCardId(json.id);
      setCardInfo(json);

      await fetchTransactions(json.id);
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCard(id: string) {
    try {
      const res = await fetch("/api/stripe/get-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cardId: id }),
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);

      setCardInfo(json);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchTransactions(id: string) {
    try {
      const res = await fetch("/api/stripe/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cardId: id }),
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);

      setTransactions(json);
    } catch (err) {
      console.error(err);
    }
  }

  async function initEphemeralKey(id: string) {
    try {
      const res = await fetch("/api/stripe/ephemeral-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cardId: id }),
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);

      setEphemeralKey(json);
    } catch (err) {
      console.error(err);
      alert(String(err));
    }
  }

  async function toggleFreeze() {
    if (!cardId) return;

    try {
      setLoading(true);

      const action = cardInfo?.status === "active" ? "freeze" : "unfreeze";

      const res = await fetch("/api/stripe/freeze-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardId,
          action,
        }),
      });

      const json = await res.json();

      if (json.error) throw new Error(json.error);

      setCardInfo(json);
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  function copyNumber() {
    if (!revealed) {
      alert("Reveal card first");
      return;
    }

    const masked = `•••• •••• •••• ${cardInfo?.last4 ?? "0000"}`;

    navigator.clipboard.writeText(masked);

    alert("Copied: " + masked);
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Virtual Card</h1>

      {/* CARD DISPLAY */}

      <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 text-white rounded-2xl p-6 shadow-xl space-y-6">

        <div className="flex justify-between">
          <span className="text-sm opacity-70">TipLinkMe Card</span>
          <span className="font-bold">
            {(cardInfo?.brand ?? "VISA").toUpperCase()}
          </span>
        </div>

        <div className="text-xl tracking-widest">
          {cardId
            ? revealed
              ? `•••• •••• •••• ${cardInfo?.last4 ?? "0000"}`
              : "•••• •••• •••• ••••"
            : "No card created"}
        </div>

        <div className="flex justify-between text-sm">

          <div>
            <p className="opacity-60">Cardholder</p>
            <p>{cardInfo?.cardholder_name ?? "You"}</p>
          </div>

          <div>
            <p className="opacity-60">Expires</p>
            <p>
              {cardInfo
                ? `${cardInfo.exp_month ?? "--"}/${cardInfo.exp_year
                    ? String(cardInfo.exp_year).slice(-2)
                    : "--"}`
                : "--"}
            </p>
          </div>

          <div>
            <p className="opacity-60">Status</p>
            <p
              className={
                cardInfo?.status === "active"
                  ? "text-green-300"
                  : "text-red-300"
              }
            >
              {cardInfo?.status ?? "--"}
            </p>
          </div>

        </div>

        {cardId && revealed && (
          <div>
            {ephemeralKey ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: ephemeralKey.secret }}
              >
                <CardDetails />
              </Elements>
            ) : (
              <p className="text-sm opacity-70">
                Initializing secure reveal...
              </p>
            )}
          </div>
        )}
      </div>

      {/* CARD ACTIONS */}

      <div className="flex gap-3 flex-wrap">

        {!cardId && (
          <div className="text-sm text-white/60">
            Your virtual card will appear after onboarding is complete.
          </div>
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

            <button
              onClick={toggleFreeze}
              className="px-4 py-2 rounded-lg border"
            >
              {cardInfo?.status === "active"
                ? "Freeze Card"
                : "Unfreeze Card"}
            </button>

            <button
              onClick={copyNumber}
              className="px-4 py-2 rounded-lg border"
            >
              Copy Number
            </button>
          </>
        )}
      </div>

      {/* TRANSACTIONS */}

      <div>
        <h2 className="text-lg font-semibold mb-3">
          Recent Transactions
        </h2>

        <div className="space-y-3">

          {transactions.length === 0 && (
            <div className="text-sm opacity-60">
              No transactions yet
            </div>
          )}

          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex justify-between border p-3 rounded-lg"
            >
              <span>{tx.merchant_data?.name ?? "Unknown"}</span>

              <span className="text-red-400">
                -${(tx.amount / 100).toFixed(2)}
              </span>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
