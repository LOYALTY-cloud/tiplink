"use client";

import { getTheme } from "@/lib/getTheme";

type TipPagePreviewProps = {
  themeName?: string;
  description?: string;
  themeKey?: string;
  className?: string;
};

export function TipPagePreview({
  themeName = "Theme",
  description,
  themeKey = "default",
  className = "",
}: TipPagePreviewProps) {
  const themeConfig = getTheme(themeKey);

  return (
    <div
      className={`h-full rounded-2xl border ${themeConfig.border} bg-black/40 p-3 flex flex-col justify-between ${themeConfig.text} ${className}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white/20 border border-white/30" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold leading-tight">1neLink</h3>
            <p className="text-[10px] text-white/75 leading-tight">@born2win</p>
          </div>
        </div>
        <div className="h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
          <span className="text-emerald-300 text-[10px] font-semibold">$</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" className={`py-1.5 rounded-lg text-[10px] font-semibold ${themeConfig.inputBg} border ${themeConfig.border}`}>$5</button>
          <button type="button" className={`py-1.5 rounded-lg text-[10px] font-semibold ${themeConfig.inputBg} border ${themeConfig.border}`}>$10</button>
          <button type="button" className={`py-1.5 rounded-lg text-[10px] font-semibold ${themeConfig.inputBg} border ${themeConfig.border}`}>$20</button>
        </div>

        <button type="button" className={`w-full py-1.5 rounded-lg text-[10px] font-semibold ${themeConfig.inputBg} border ${themeConfig.border}`}>
          Custom
        </button>

        <div className={`h-8 rounded-lg ${themeConfig.inputBg} border ${themeConfig.border} px-2 flex items-center text-[10px] text-white/70`}>
          $ 0.00
        </div>

        <div className={`h-8 rounded-lg ${themeConfig.inputBg} border ${themeConfig.border} px-2 flex items-center text-[10px] text-white/70`}>
          Leave a note
        </div>

        <div className={`h-8 rounded-lg ${themeConfig.inputBg} border ${themeConfig.border} px-2 flex items-center text-[10px] text-white/70`}>
          Email for receipt
        </div>

        <div className={`rounded-lg ${themeConfig.inputBg} border ${themeConfig.border} p-2`}>
          <div className="text-[9px] text-white/55 mb-1">Secure payment · Stripe</div>
          <button type="button" className="w-full rounded-lg bg-emerald-400 py-1.5 text-[10px] font-semibold text-black">
            Continue to payment
          </button>
        </div>
      </div>

      <div className="pt-2 text-center shrink-0">
        <p className="text-[11px] text-white/85 font-medium">{themeName}</p>
        {description ? <p className="text-[10px] text-white/55">{description}</p> : null}
      </div>
    </div>
  );
}
