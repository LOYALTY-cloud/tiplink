"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckoutTheme = {
  id: string;
  name: string;
  price: number;
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function ThemeCheckoutModal({
  theme,
  onClose,
  isLegacy = false,
}: {
  theme: CheckoutTheme;
  onClose: () => void;
  isLegacy?: boolean;
}) {
  const router = useRouter();

  const isFree = theme.price <= 0;

  const [balance, setBalance]               = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // free claim
  const [freeClaiming, setFreeClaiming] = useState(false);
  const [freeError, setFreeError]       = useState<string | null>(null);

  // balance pay
  const [balancePaying, setBalancePaying] = useState(false);
  const [balanceError, setBalanceError]   = useState<string | null>(null);

  const [alreadyOwned, setAlreadyOwned] = useState(false);

  const canPayWithBalance = balance !== null && balance >= theme.price;
  const isProcessing      = freeClaiming || balancePaying;

  // ── Fetch wallet balance ──────────────────────────────────────────────────
  useEffect(() => {
    if (isFree) { setBalanceLoading(false); return; }
    let cancelled = false;

    (async () => {
      setBalanceLoading(true);
      try {
        const token = await getToken();
        const res = await fetch("/api/wallet/balance", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!cancelled) {
          const json = res.ok ? await res.json() : {};
          setBalance(Number(json.total_balance ?? json.balance ?? 0));
        }
      } catch {
        if (!cancelled) setBalance(0);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isFree]);

  // ── ESC key ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isProcessing]);

  // ── Free claim ────────────────────────────────────────────────────────────
  async function handleFreeClaim() {
    setFreeClaiming(true);
    setFreeError(null);
    try {
      const token = await getToken();
      if (!token) { setFreeError("Please log in to claim this theme."); return; }

      const res = await fetch("/api/themes/market-free-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme_id: theme.id }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFreeError(
          json.error === "You cannot unlock your own theme"
            ? "You created this theme — creators can't claim their own themes."
            : (json.error ?? "Could not claim theme. Please try again.")
        );
        return;
      }
      if (json.already_owned) { setAlreadyOwned(true); return; }
      router.push(`/dashboard/mythemes?theme_unlocked=${theme.id}`);
    } catch {
      setFreeError("Something went wrong. Please try again.");
    } finally {
      setFreeClaiming(false);
    }
  }

  // ── Balance pay ───────────────────────────────────────────────────────────
  async function handleBalancePay() {
    if (!canPayWithBalance) return;
    setBalancePaying(true);
    setBalanceError(null);

    try {
      const token = await getToken();
      if (!token) { setBalanceError("Session expired. Please reload and try again."); return; }

      const url  = isLegacy ? "/api/themes/purchase-with-balance" : "/api/themes/buy-with-balance";
      const body = isLegacy ? { theme: theme.id } : { theme_id: theme.id };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === "You cannot purchase your own theme") {
          setBalanceError("You created this theme — creators can't purchase their own themes.");
          return;
        }
        if (json.insufficient_balance || json.error === "insufficient_balance") {
          setBalance(Number(json.balance ?? 0));
          setBalanceError("Insufficient balance. Earn more from tips or theme sales to unlock this theme.");
          return;
        }
        setBalanceError(json.error ?? "Purchase failed. Please try again.");
        return;
      }

      router.push(isLegacy ? "/dashboard/mythemes" : `/dashboard/mythemes?theme_unlocked=${theme.id}`);
    } catch {
      setBalanceError("Something went wrong. Please try again.");
    } finally {
      setBalancePaying(false);
    }
  }

  const remaining = balance !== null ? balance - theme.price : null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (isProcessing) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-[#0e1420] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
          <div>
            <p className="text-sm font-semibold text-white">{theme.name}</p>
            <p className="text-xs text-white/50 mt-0.5">
              {isFree ? "Free · add to your collection" : `$${theme.price.toFixed(2)} · one-time purchase`}
            </p>
          </div>
          <button
            onClick={() => { if (!isProcessing) onClose(); }}
            disabled={isProcessing}
            className="w-8 h-8 rounded-lg bg-white/6 hover:bg-white/12 flex items-center justify-center transition"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Free claim ─────────────────────────────────────────────────── */}
        {isFree && (
          <div className="px-5 py-6 space-y-4">
            {alreadyOwned ? (
              <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-4 py-4 text-sm text-emerald-300 space-y-3">
                <p className="font-medium">✓ You already own this theme!</p>
                <p className="text-emerald-300/70 text-xs">This theme is already in your library. Head to My Themes to apply it.</p>
                <button
                  onClick={() => router.push("/dashboard/mythemes")}
                  className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-xs font-semibold py-2 rounded-lg transition"
                >
                  Go to My Themes →
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-4 text-center">
                  <p className="text-2xl font-black text-emerald-300 mb-1">Free</p>
                  <p className="text-xs text-white/50">No payment needed — add instantly to your collection</p>
                </div>
                {freeError && (
                  <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-3.5 py-2.5 text-sm text-red-300">
                    {freeError}
                  </div>
                )}
                <button
                  onClick={handleFreeClaim}
                  disabled={freeClaiming}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {freeClaiming ? (
                    <span className="flex items-center justify-center gap-2"><Spinner /> Claiming…</span>
                  ) : "Claim Free Theme"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Balance pay ────────────────────────────────────────────────── */}
        {!isFree && (
          <div className="px-5 py-5 space-y-4">
            {balanceLoading ? (
              <div className="flex items-center gap-2 text-sm text-white/40 py-6 justify-center">
                <Spinner /> Checking balance…
              </div>
            ) : alreadyOwned ? (
              <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-4 py-4 text-sm text-emerald-300 space-y-3">
                <p className="font-medium">✓ You already own this theme!</p>
                <p className="text-emerald-300/70 text-xs">This theme is already in your library.</p>
                <button
                  onClick={() => router.push("/dashboard/mythemes")}
                  className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-xs font-semibold py-2 rounded-lg transition"
                >
                  Go to My Themes →
                </button>
              </div>
            ) : (
              <>
                {/* Balance summary */}
                <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-3.5 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Your balance</span>
                    <span className="font-medium text-white">${(balance ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Theme price</span>
                    <span className="font-medium text-white">−${theme.price.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-white/8" />
                  <div className="flex justify-between">
                    <span className="text-white/60">Remaining</span>
                    <span className={"font-semibold " + (canPayWithBalance ? "text-emerald-400" : "text-red-400")}>
                      {canPayWithBalance
                        ? `$${remaining!.toFixed(2)}`
                        : `−$${Math.abs(remaining!).toFixed(2)} short`}
                    </span>
                  </div>
                </div>

                {/* Insufficient balance notice */}
                {!canPayWithBalance && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-400/25 px-3.5 py-3 text-sm text-amber-300/90">
                    Your balance isn&apos;t enough to cover this purchase. Earn more from tips or theme sales to unlock this theme.
                  </div>
                )}

                {balanceError && (
                  <div className="rounded-lg bg-red-500/15 border border-red-400/25 px-3 py-2.5 text-sm text-red-300">
                    {balanceError}
                  </div>
                )}

                <button
                  onClick={handleBalancePay}
                  disabled={!canPayWithBalance || balancePaying}
                  className={
                    "w-full py-3.5 rounded-xl font-semibold text-sm transition " +
                    (!canPayWithBalance || balancePaying
                      ? "bg-white/10 text-white/30 cursor-not-allowed"
                      : "bg-white text-black hover:bg-white/90 active:scale-[0.98]")
                  }
                >
                  {balancePaying ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Processing…
                    </span>
                  ) : canPayWithBalance ? (
                    `Pay $${theme.price.toFixed(2)} from balance`
                  ) : (
                    "Insufficient balance"
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 pt-0">
          <button
            onClick={() => { if (!isProcessing) onClose(); }}
            disabled={isProcessing}
            className="w-full text-sm text-white/40 hover:text-white/60 transition py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
