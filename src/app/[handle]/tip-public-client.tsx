"use client";

import { useMemo, useState, useRef } from "react";
import PublicTipCheckout from "@/components/PublicTipCheckout";
import { ui } from "@/lib/ui";

type Profile = {
  user_id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  links?: string[] | null;
};

const PRESETS = [5, 10, 20];

function isValidUrl(u: string) {
  try {
    const url = new URL(u);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function CircleIcon({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={`h-12 w-12 rounded-full ${ui.cardInner} flex items-center justify-center transition`}
    >
      <span className="text-white/85 text-sm">↗</span>
    </a>
  );
}

export default function TipPublicClient({ profile }: { profile: Profile }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState<string>("");
  const [note, setNote] = useState<string>("");
  
  // Payment state
  const payRef = useRef<HTMLDivElement | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<{ tip: number; stripeFee: number; platformFee: number; total: number } | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const links = useMemo(() => {
    const raw = Array.isArray(profile.links) ? profile.links : [];
    return raw.filter((x) => typeof x === "string" && isValidUrl(x)).slice(0, 5);
  }, [profile.links]);

  const displayName = profile.display_name?.trim() || `@${profile.handle}`;
  const handleText = `@${profile.handle}`;

  const chosenAmount = useMemo(() => {
    if (amount !== null) return amount;
    const n = Number(custom);
    if (Number.isFinite(n) && n > 0) return n;
    return 0;
  }, [amount, custom]);

  async function handleContinueToPayment() {
    if (chosenAmount <= 0) return;

    setLoadingIntent(true);

    const res = await fetch("/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_user_id: profile.user_id,
        tip_amount: chosenAmount,
        note,
      }),
    });

    const data = await res.json();
    setLoadingIntent(false);

    if (!res.ok) {
      alert(data?.error || "Could not start payment.");
      return;
    }

    setClientSecret(data.clientSecret);
    setReceiptId(data.receiptId);
    setBreakdown(data.breakdown);
    setShowPayment(true);

    // smooth scroll to payment box
    setTimeout(() => {
      payRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="min-h-screen">
      {/* Header gradient */}
      <div className="relative">
        <div className="h-44 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <div className={`h-24 w-24 rounded-2xl overflow-hidden ${ui.cardInner}`}>
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`h-full w-full flex items-center justify-center font-semibold ${ui.muted}`}>
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-md px-5 pb-10">
        <div className="pt-16 text-center">
          <div className={ui.h1}>{displayName}</div>
          <div className={`mt-1 ${ui.muted}`}>{handleText}</div>

          {profile.location ? (
            <div className={`mt-2 text-sm ${ui.muted2}`}>
              📍 {profile.location}
            </div>
          ) : null}

          {profile.bio ? (
            <div className={`mt-2 text-sm ${ui.muted}`}>
              {profile.bio}
            </div>
          ) : null}

          {/* Social / links row */}
          {links.length > 0 ? (
            <div className="mt-5 flex items-center justify-center gap-3">
              {links.map((href, i) => (
                <CircleIcon key={href + i} href={href} label={`Link ${i + 1}`} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Tip card */}
        <div className={`${ui.card} mt-7 p-5`}>
          <div className="flex items-center justify-between">
            <div className={ui.h2}>Tip Jar</div>
            <div className="h-9 w-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <span className="text-emerald-300 font-semibold">$</span>
            </div>
          </div>

          {/* Presets */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {PRESETS.map((p) => {
              const active = amount === p;
              return (
                <button
                  key={p}
                  onClick={() => {
                    setAmount(p);
                    setCustom("");
                  }}
                  className={
                    active
                      ? `${ui.btnPrimary} ${ui.btnSmall}`
                      : `${ui.btnGhost} ${ui.btnSmall}`
                  }
                >
                  ${p}
                </button>
              );
            })}
          </div>

          {/* Custom */}
          <button
            onClick={() => setAmount(null)}
            className={`mt-3 w-full ${amount === null ? ui.btnPrimary : ui.btnGhost}`}
          >
            Custom
          </button>

          {/* Custom input */}
          {amount === null ? (
            <div className="mt-3">
              <div className="">
                <div className="flex items-center">
                  <span className="text-white/70 mr-2">$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    className={ui.input}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-white/50">
                Enter the amount you want to send.
              </div>
            </div>
          ) : null}

          {/* Note */}
          <div className="mt-4">
            <div className="text-sm font-medium text-white/90">Leave a note (optional)</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Private support…"
              className={`${ui.input} mt-2 min-h-[80px]`}
            />
            <div className="mt-1 text-xs text-white/50">{note.length}/200</div>
          </div>

          {/* Payment area */}
          <div className={`${ui.cardInner} mt-4 p-3`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${ui.muted}`}>Secure payment</div>
                <div className={`mt-1 text-xs ${ui.muted2}`}>
                  Powered by Stripe. No account required.
                </div>
              </div>

              {showPayment ? (
                <button
                  onClick={() => setShowPayment(false)}
                  className={`${ui.btnGhost} px-3 py-2 text-xs`}
                >
                  Hide
                </button>
              ) : null}
            </div>

            {/* Continue button (when payment not opened yet) */}
            {!showPayment ? (
              <button
                onClick={handleContinueToPayment}
                disabled={chosenAmount <= 0 || loadingIntent}
                className={
                  chosenAmount > 0 && !loadingIntent
                    ? `${ui.btnPrimary} w-full mt-3`
                    : "mt-3 w-full rounded-xl py-3 font-semibold transition bg-white/20 text-white/50 cursor-not-allowed"
                }
              >
                {loadingIntent ? "Loading payment..." : "Continue to payment"}
              </button>
            ) : null}

            {/* Expanded payment UI */}
              {showPayment ? (
              <div ref={payRef} className={`${ui.card} mt-4 p-4`}>
                {/* breakdown inside payment area (feels premium) */}
                <div className="mb-3 text-sm">
                  <div className={`flex items-center justify-between ${ui.muted}`}>
                    <span>Tip</span>
                    <span>${(breakdown?.tip ?? chosenAmount).toFixed(2)}</span>
                  </div>
                  <div className={`mt-1 flex items-center justify-between ${ui.muted2}`}>
                    <span>Processing fee</span>
                    <span>${(breakdown?.stripeFee ?? 0).toFixed(2)}</span>
                  </div>
                  <div className={`mt-1 flex items-center justify-between font-semibold ${ui.muted}`}>
                    <span>Total</span>
                    <span>${(breakdown?.total ?? chosenAmount).toFixed(2)}</span>
                  </div>
                </div>

                {clientSecret && receiptId ? (
                  <PublicTipCheckout
                    clientSecret={clientSecret}
                    receiptUrl={`${window.location.origin}/r/${receiptId}`}
                  />
                ) : (
                  <div className="text-sm text-white/70">Preparing checkout…</div>
                )}

                <div className="mt-3 text-xs text-white/50">
                  Apple Pay / Google Pay will appear automatically when available on your device.
                </div>
              </div>
            ) : null}
          </div>

          {/* Breakdown */}
          <div className="mt-4 text-sm">
            <div className={`flex items-center justify-between ${ui.muted}`}>
              <span>Tip</span>
              <span>${(breakdown?.tip ?? chosenAmount).toFixed(2)}</span>
            </div>
            <div className={`mt-1 flex items-center justify-between ${ui.muted2}`}>
              <span>Processing fee</span>
              <span>{breakdown ? `$${breakdown.stripeFee.toFixed(2)}` : 'Calculated at checkout'}</span>
            </div>
            {breakdown && (
              <div className={`mt-1 flex items-center justify-between font-semibold ${ui.muted} border-t border-white/10 pt-2`}>
                <span>Total</span>
                <span>${breakdown.total.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Removed: Private support • Receipts included */}
        </div>

        {/* Small footer */}
        <div className="mt-6 text-center text-xs text-white/40">
          TipLinkMe • Secure tips
        </div>
      </div>
    </div>
  );
}
