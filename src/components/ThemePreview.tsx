"use client";

import React from "react";

export type ThemeConfig = {
  background?: string;
  backgroundMediaType?: "image" | "video";
  backgroundVideo?: string;
  backgroundVideoPoster?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  animation?: "none" | "glow" | "pulse" | "neon";
  // Animation Engine v1
  backgroundType?: "static" | "gradient" | "animation";
  motion?: "bounce" | "heartbeat" | "flashHit" | "particlesSoft" | "image3D" | "moneyRain" | "heartRain" | "depth3D" | "glassBreak" | "ripple" | "waterDistortion" | "layeredPopOut" | "multiLayerPop" | "vortexTunnel";
  overlay?: "dust" | "sparkle" | "lightRain" | "smoke" | "fire" | null;
  lighting?: "sweep" | "glow" | null;
  speed?: number;
  intensity?: number;
  animationType?:
    | "glow"
    | "grid"
    | "liquid"
    | "particles"
    | "glass"
    | "neonWave";
  animationSpeed?: number;
  animationIntensity?: number;
  eliteEffects?: Array<"depthBlur" | "fog" | "dust">;
  // Card fields (persisted by builder)
  cardBgMode?: "color" | "gradient" | "image" | "transparent";
  cardBackground?: string;
  cardGradientFrom?: string;
  cardGradientTo?: string;
  cardGradientDir?: string;
  cardImage?: string;
  cardOverlay?: string;
};

type Props = {
  theme: ThemeConfig;
};

export default function ThemePreview({ theme }: Props) {
  const {
    background,
    primaryColor = "#00ff99",
    accentColor = "#111",
    textColor = "#fff",
    animation = "none",
  } = theme;

  // Map animation preset → which element gets what class
  const cardClass   = animation === "glow"  ? "theme-glow"
                    : animation === "pulse" ? "theme-pulse"
                    : "";
  const btnClass    = animation === "pulse" ? "theme-pulse-btn" : "";
  const textClass   = animation === "neon"  ? "theme-neon" : "";

  // CSS variable lets glow + neon colour match the chosen primary
  const cssVars = { "--theme-primary": primaryColor } as React.CSSProperties;

  return (
    <div
      className="min-h-screen relative flex flex-col items-center px-4 py-6"
      style={{
        background: background
          ? `url(${background}) center/cover no-repeat`
          : "#000",
        color: textColor,
        ...cssVars,
      }}
    >
      {/* Dark overlay so text stays readable over any image */}
      {background && <div className="absolute inset-0 bg-black/50" />}

      {/* All content sits above the overlay */}
      <div className="relative z-10 w-full flex flex-col items-center">
      {/* Preview Label */}
      <div className="text-xs mb-2 opacity-60 tracking-widest uppercase">
        Preview Mode
      </div>

      {/* Profile Section */}
      <div className="flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-2xl bg-gray-700 mb-3" />
        <h1 className={`text-xl font-bold ${textClass}`}>DGO WORLD</h1>
        <p className={`text-sm opacity-70 ${textClass}`}>@born2win</p>
        <p className="text-xs mt-1 opacity-60">📍 AUGUSTA, GA</p>
        <p className="text-xs mt-2 opacity-80">HUSTLE AT ALL TIME</p>
      </div>

      {/* Tip Box */}
      <div
        className={`w-full max-w-md mt-6 p-4 rounded-2xl ${cardClass}`}
        style={{ background: accentColor, ...cssVars }}
      >
        {/* Quick Amounts */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[5, 10, 20].map((amt) => (
            <button
              key={amt}
              className={`py-2 rounded-xl font-semibold text-sm ${btnClass}`}
              style={{ background: primaryColor, color: "#000" }}
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Custom */}
        <button
          className="w-full py-3 rounded-xl mb-3 font-semibold text-sm"
          style={{ background: "#fff", color: "#000" }}
        >
          Custom
        </button>

        {/* Input */}
        <input
          readOnly
          placeholder="$ 0.00"
          className="w-full p-3 rounded-xl mb-3 bg-black/40 outline-none text-white placeholder:text-white/40"
        />

        {/* Note */}
        <textarea
          readOnly
          placeholder="Say something nice..."
          className="w-full p-3 rounded-xl bg-black/40 outline-none text-white placeholder:text-white/40 resize-none"
          rows={3}
        />
      </div>
      </div>
    </div>
  );
}
