"use client";

import { useMemo, useState, useRef } from "react";
import PublicTipCheckout from "@/components/PublicTipCheckout";
import { calculateTipFees } from "@/lib/fees";
import { getTheme } from "@/lib/getTheme";

type Profile = {
  user_id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  links?: string[] | null;
  canAcceptTips?: boolean;
  theme?: string | null;
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

function CircleIcon({ href, label, theme }: { href: string; label: string; theme: import("@/lib/themes").ThemeConfig }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={`h-12 w-12 rounded-full ${theme.inputBg} border ${theme.border} flex items-center justify-center transition`}
    >
      <span className={`${theme.muted} text-sm`}>↗</span>
    </a>
  );
}

export default function TipPublicClient({ profile }: { profile: Profile }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [supporterName, setSupporterName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  
  // Payment state
  const payRef = useRef<HTMLDivElement | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<{ tip: number; stripeFee: number; platformFee: number; total: number } | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const theme = getTheme(profile.theme);

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

  const fees = useMemo(() => calculateTipFees(chosenAmount), [chosenAmount]);

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
        supporter_name: isAnonymous ? null : supporterName,
        message: note,
        is_anonymous: isAnonymous,
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
    <div className={`min-h-screen ${theme.bg} ${theme.text} ${theme.wrapper} ${profile.theme === "violet" ? "relative violet-glow" : ""}`}>
      {/* Header gradient */}
      <div className="relative">
        <div className="h-44 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <div className={`h-24 w-24 rounded-2xl overflow-hidden border ${theme.border} ${theme.inputBg}`}>
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`h-full w-full flex items-center justify-center font-semibold ${theme.muted}`}>
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-md px-5 pb-10">
        <div className="pt-16 text-center">
          <div className="text-3xl md:text-4xl font-semibold tracking-tight">{displayName}</div>
          <div className={`mt-1 ${theme.muted}`}>{handleText}</div>

          {profile.location ? (
            <div className={`mt-2 text-sm ${theme.muted2}`}>
              📍 {profile.location}
            </div>
          ) : null}

          {profile.bio ? (
            <div className={`mt-2 text-sm ${theme.muted}`}>
              {profile.bio}
            </div>
          ) : null}

          {/* Social / links row */}
          {links.length > 0 ? (
            <div className="mt-5 flex items-center justify-center gap-3">
              {links.map((href, i) => (
                <CircleIcon key={href + i} href={href} label={`Link ${i + 1}`} theme={theme} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Tip card */}
        <div className={`rounded-2xl border p-5 mt-7 ${theme.card}`}>
          <div className="flex items-center justify-between">
            <div className="text-xl md:text-2xl font-semibold">Tip Jar</div>
            <div className="h-9 w-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <span className="text-emerald-300 font-semibold">$</span>
            </div>
          </div>

          {/* Setup banner */}
          {profile.canAcceptTips === false && (
            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center">
              <p className="text-sm font-medium text-amber-300">This creator is finishing account setup</p>
              <p className="mt-1 text-xs text-amber-300/70">Tips will be available once verification is complete.</p>
            </div>
          )}

          {/* Presets */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {PRESETS.map((p) => {
              const active = amount === p;
              return (
                <button
                  key={p}
                  disabled={profile.canAcceptTips === false}
                  onClick={() => {
                    setAmount(p);
                    setCustom("");
                  }}
                  className={
                    profile.canAcceptTips === false
                      ? `rounded-lg px-3 py-2 text-sm font-semibold ${theme.inputBg} border ${theme.border} ${theme.muted2} opacity-50 cursor-not-allowed`
                      : active
                        ? `rounded-lg px-3 py-2 text-sm font-semibold ${theme.button}`
                        : `rounded-lg px-3 py-2 text-sm font-semibold ${theme.inputBg} border ${theme.border} ${theme.muted} hover:opacity-80`
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
            className={`mt-3 w-full rounded-xl px-4 py-3 font-semibold transition ${amount === null ? theme.button : `${theme.inputBg} border ${theme.border} ${theme.muted} hover:opacity-80`}`}
          >
            Custom
          </button>

          {/* Custom input */}
          {amount === null ? (
            <div className="mt-3">
              <div className="">
                <div className="flex items-center">
                  <span className={`${theme.muted} mr-2`}>$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    className={`w-full rounded-xl ${theme.inputBg} border ${theme.border} px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/15 transition placeholder:${theme.muted2}`}
                  />
                </div>
              </div>
              <div className={`mt-2 text-xs ${theme.muted2}`}>
                Enter the amount you want to send.
              </div>
            </div>
          ) : null}

          {/* Note */}
          <div className="mt-4">
            <div className="text-sm font-medium">Leave a note (optional)</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Say something nice…"
              className={`w-full rounded-xl ${theme.inputBg} border ${theme.border} px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/15 transition mt-2 min-h-[80px] placeholder:${theme.muted2}`}
            />
            <div className={`mt-1 text-xs ${theme.muted2}`}>{note.length}/200</div>
          </div>

          {/* Anonymous toggle */}
          <div className={`mt-4 flex items-center justify-between ${theme.inputBg} border ${theme.border} rounded-xl p-3`}>
            <span className={`text-sm ${theme.muted}`}>Send anonymously</span>
            <button
              type="button"
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`w-12 h-6 rounded-full transition ${isAnonymous ? "bg-blue-500" : theme.inputBg}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transform transition ${isAnonymous ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Supporter name (shown when not anonymous) */}
          {!isAnonymous && (
            <div className="mt-3">
              <div className="text-sm font-medium">Your name</div>
              <input
                value={supporterName}
                onChange={(e) => setSupporterName(e.target.value)}
                maxLength={100}
                placeholder="Your name"
                className={`w-full rounded-xl ${theme.inputBg} border ${theme.border} px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/15 transition mt-2`}
              />
            </div>
          )}

          {/* Payment area */}
          <div className={`${theme.inputBg} border ${theme.border} rounded-xl mt-4 p-3`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${theme.muted}`}>Secure payment</div>
                <div className={`mt-1 text-xs ${theme.muted2}`}>
                  Powered by Stripe. No account required.
                </div>
              </div>

              {showPayment ? (
                <button
                  onClick={() => setShowPayment(false)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${theme.inputBg} border ${theme.border} ${theme.muted}`}
                >
                  Hide
                </button>
              ) : null}
            </div>

            {/* Continue button (when payment not opened yet) */}
            {!showPayment ? (
              <button
                onClick={handleContinueToPayment}
                disabled={chosenAmount <= 0 || loadingIntent || profile.canAcceptTips === false}
                className={
                    chosenAmount > 0 && !loadingIntent && profile.canAcceptTips !== false
                    ? `rounded-xl px-4 py-3 font-semibold ${theme.button} ${theme.glow} w-full mt-3`
                    : `mt-3 w-full rounded-xl py-3 font-semibold transition ${theme.inputBg} ${theme.muted2} cursor-not-allowed`
                }
              >
                {loadingIntent ? "Loading payment..." : profile.canAcceptTips === false ? "Tips unavailable" : "Continue to payment"}
              </button>
            ) : null}

            {/* Expanded payment UI */}
              {showPayment ? (
              <div ref={payRef} className={`rounded-2xl border ${theme.border} ${theme.inputBg} mt-4 p-4`}>
                {/* breakdown */}
                <div className="mb-3 text-sm">
                  <div className={`flex items-center justify-between ${theme.muted}`}>
                    <span>Tip</span>
                    <span>${(breakdown?.tip ?? chosenAmount).toFixed(2)}</span>
                  </div>
                  <div className={`mt-1 flex items-center justify-between ${theme.muted2}`}>
                    <span>Fee</span>
                    <span>${((breakdown?.stripeFee ?? 0) + (breakdown?.platformFee ?? 0)).toFixed(2)}</span>
                  </div>
                  <div className={`mt-1 flex items-center justify-between font-semibold ${theme.muted}`}>
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
                  <div className={`text-sm ${theme.muted}`}>Preparing checkout…</div>
                )}

                <div className={`mt-3 text-xs ${theme.muted2}`}>
                  Apple Pay / Google Pay will appear automatically when available on your device.
                </div>
              </div>
            ) : null}
          </div>

          {/* Breakdown (only shown before payment is opened) */}
          {chosenAmount > 0 && !showPayment && (
            <div className={`mt-4 ${theme.inputBg} border ${theme.border} rounded-xl p-4 space-y-2`}>
              <div className={`flex justify-between text-sm ${theme.muted}`}>
                <span>Tip</span>
                <span>${chosenAmount.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between text-sm ${theme.muted}`}>
                <span>Fee</span>
                <span>${fees.totalFees.toFixed(2)}</span>
              </div>
              <div className={`flex justify-between text-base font-semibold pt-2 border-t ${theme.border}`}>
                <span>Total</span>
                <span>${fees.total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Removed: Private support • Receipts included */}
        </div>

        {/* Small footer */}
        <div className={`mt-6 text-center text-xs ${theme.muted2}`}>
          1neLink • Secure tips
        </div>
      </div>
    </div>
  );
}
