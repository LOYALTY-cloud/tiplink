"use client";

import { getTheme } from "@/lib/getTheme";
import { THEME_PRICE_LABEL, BUNDLE_PRICE_LABEL } from "@/lib/themes";

export default function ThemePreviewModal({
  themeKey,
  onClose,
  onUnlockCard,
  onUnlockBalance,
  balance,
  purchasing,
  isBundle,
}: {
  themeKey: string;
  onClose: () => void;
  onUnlockCard: () => void;
  onUnlockBalance: () => void;
  balance: number;
  purchasing?: boolean;
  isBundle?: boolean;
}) {
  const theme = getTheme(themeKey);
  const price = isBundle ? 4.99 : 1.99;
  const priceLabel = isBundle ? BUNDLE_PRICE_LABEL : THEME_PRICE_LABEL;
  const canAfford = balance >= price;
  const shortfall = price - balance;
  const isClose = !canAfford && shortfall > 0 && shortfall <= 1.0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
        {/* Full preview */}
        <div className={`p-6 ${theme.bg} ${theme.text} ${theme.wrapper}`}>
          <div className={`rounded-xl p-5 border ${theme.card}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                C
              </div>
              <div>
                <p className={`text-sm font-semibold`}>@creator</p>
                <p className={`text-xs ${theme.muted2}`}>Los Angeles, CA</p>
              </div>
            </div>

            <p className={`text-xs ${theme.muted2} mb-4`}>Support my work with a tip 💸</p>

            <input
              readOnly
              placeholder="$0.00"
              className={`w-full mb-3 p-3 rounded-xl ${theme.inputBg} border ${theme.border} placeholder:${theme.muted2}`}
            />

            <button className={`w-full py-2.5 rounded-xl font-semibold text-sm ${theme.button} ${theme.glow}`}>
              Send Tip
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-[#0A1128] border-t border-white/10 p-4 space-y-3">
          <p className="text-sm text-white/70 text-center">
            {isBundle ? (
              <>Unlock <span className="font-semibold text-yellow-300">All Themes</span> for {priceLabel} <span className="text-[10px] text-white/40">(Save 40%)</span></>
            ) : (
              <>Unlock <span className="capitalize font-semibold text-white">{themeKey}</span> theme for {priceLabel}</>
            )}
          </p>

          {/* Balance bar */}
          <div className={`rounded-lg px-3 py-2 ${canAfford ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/5 border border-white/10"}`}>
            <div className="flex items-center justify-between text-xs">
              <span className={canAfford ? "text-emerald-300" : "text-white/40"}>
                {canAfford ? "✓ Recommended — use your balance" : "Your Balance"}
              </span>
              <span className={`font-bold ${canAfford ? "text-emerald-400" : "text-white/60"}`}>
                ${balance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Smart nudge when close to affording */}
          {isClose && (
            <p className="text-center text-[11px] text-amber-300/80">
              You&apos;re only <span className="font-bold">${shortfall.toFixed(2)}</span> away — receive one more tip to unlock!
            </p>
          )}

          {/* Pay with Balance — PRIMARY when affordable */}
          <button
            onClick={onUnlockBalance}
            disabled={!canAfford || purchasing}
            className={`w-full text-sm font-semibold py-2.5 rounded-xl transition ${
              canAfford && !purchasing
                ? "bg-emerald-600 hover:bg-emerald-500 text-white ring-1 ring-emerald-400/30"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {purchasing
              ? "Processing…"
              : canAfford
                ? `Pay with Balance — ${priceLabel}`
                : "Insufficient Balance"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-white/10" />
            <span className="text-[10px] text-white/30 uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-white/10" />
          </div>

          {/* Pay with Card — secondary */}
          <button
            onClick={onUnlockCard}
            disabled={purchasing}
            className={`w-full text-sm font-semibold py-2.5 rounded-xl transition ${
              canAfford
                ? "bg-white/10 hover:bg-white/15 text-white/70"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            Pay with Card
          </button>

          <button
            onClick={onClose}
            disabled={purchasing}
            className="w-full text-sm text-white/40 hover:text-white/60 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
