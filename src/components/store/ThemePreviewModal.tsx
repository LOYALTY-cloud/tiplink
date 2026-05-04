"use client";

import { useEffect, useState } from "react";
import AnimationRenderer from "@/components/theme/AnimationRenderer";
import ThemeBackgroundVideo from "@/components/theme/ThemeBackgroundVideo";
import ThemeCarousel3D from "@/components/theme/ThemeCarousel3D";
import type { MotionType } from "@/lib/animationAccess";

export type PreviewTheme = {
  name: string;
  config: Record<string, unknown>;
  priceLabel: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
};

export default function ThemePreviewModal({
  theme,
  onClose,
}: {
  theme: PreviewTheme;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  // Delay mounting heavy media until after the slide-in animation settles.
  // This prevents video decode + canvas + CSS transform all competing at once.
  const [mediaReady, setMediaReady] = useState(false);
  // Track actual viewport so we only mount ONE bg layer — the correct one.
  // CSS display:none (md:hidden) does NOT stop React from running hooks inside
  // that tree, so without this both ThemeBackgroundVideo instances would mount.
  const [isDesktop, setIsDesktop] = useState(false);

  const cfg = theme.config;

  // ── background & motion ──────────────────────────────────────────────────
  const backgroundVideo = typeof cfg.backgroundVideo === "string" ? cfg.backgroundVideo : null;
  const backgroundVideoPoster = typeof cfg.backgroundVideoPoster === "string" ? cfg.backgroundVideoPoster : null;
  const backgroundImage = typeof cfg.background === "string" ? cfg.background : null;
  const isVideo = cfg.backgroundMediaType === "video" || Boolean(backgroundVideo);
  const motion = typeof cfg.motion === "string" ? cfg.motion : null;
  const isCarousel = motion === "carousel3D";
  const speed = typeof cfg.speed === "number" ? cfg.speed : 5;
  const intensity = typeof cfg.intensity === "number" ? cfg.intensity : 5;
  const motionSettings = cfg.motionSettings && typeof cfg.motionSettings === "object"
    ? (cfg.motionSettings as Record<string, unknown>) : undefined;
  const hasBackgroundMedia = Boolean(backgroundImage || backgroundVideo);

  // ── derived theme colors (mirrors builder) ───────────────────────────────
  const tc = typeof cfg.textColor === "string" ? cfg.textColor : "#ffffff";
  const muted = tc + "99";
  const primary = typeof cfg.primaryColor === "string" ? cfg.primaryColor : "#00ff99";
  const inputBg = "rgba(255,255,255,0.07)";
  const border = "1px solid rgba(255,255,255,0.12)";
  const cardBgMode = typeof cfg.cardBgMode === "string" ? cfg.cardBgMode : "default";
  const cardBg = (() => {
    switch (cardBgMode) {
      case "color": return typeof cfg.cardBackground === "string" ? cfg.cardBackground : "#111111";
      case "gradient": return `linear-gradient(${typeof cfg.cardGradientDir === "string" ? cfg.cardGradientDir : "to bottom right"}, ${typeof cfg.cardGradientFrom === "string" ? cfg.cardGradientFrom : "#1a1a2e"}, ${typeof cfg.cardGradientTo === "string" ? cfg.cardGradientTo : "#16213e"})`;
      case "image": return typeof cfg.cardImage === "string" && cfg.cardImage ? `url(${cfg.cardImage}) center/cover no-repeat` : "rgba(255,255,255,0.04)";
      case "transparent": return "transparent";
      default: return "rgba(255,255,255,0.04)";
    }
  })();
  const cardBackdrop = cardBgMode === "transparent" ? "none" : "blur(8px)";
  const pageBg = isVideo ? "#060D1F" : backgroundImage ? `url(${backgroundImage}) center/cover no-repeat` : "#060D1F";

  // ── mount / close animations ─────────────────────────────────────────────
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    // Start media AFTER slide animation finishes (320ms) + small buffer
    const mt = setTimeout(() => setMediaReady(true), 380);
    // Detect viewport once on mount so we know which bg layer to activate
    const mq = window.matchMedia("(min-width: 768px)");
    const syncDesktop = () => setIsDesktop(mq.matches);
    syncDesktop();
    mq.addEventListener("change", syncDesktop);
    return () => { cancelAnimationFrame(id); clearTimeout(mt); mq.removeEventListener("change", syncDesktop); };
  }, []);

  const handleClose = () => setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 300);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  // ── body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── ESC ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isVisible = ready && !closing;

  // Background media layer.
  // On mobile we skip the AnimationRenderer overlay for video themes — canvas
  // effects on top of a playing video are too heavy for most phones.
  // stripMotion=true → pass motionType=null to ThemeBackgroundVideo so no
  // canvas RAF loops start (video glitch / rain / streetImpact are all canvas).
  // On mobile this is the biggest perf win: raw video decode without overlay.
  const buildBgLayer = (skipOverlay = false, stripMotion = false) => (
    <div className="absolute inset-0 z-0 pointer-events-none" style={{ contain: "strict" }}>
      {isCarousel && (
        <ThemeCarousel3D
          src={backgroundVideo || backgroundVideoPoster || ""}
          mediaType={backgroundVideo ? "video" : "image"}
          poster={backgroundVideoPoster || undefined}
          speed={speed}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {!isCarousel && isVideo && backgroundVideo && (
        <ThemeBackgroundVideo
          src={backgroundVideo}
          poster={backgroundVideoPoster || undefined}
          motionType={stripMotion ? null : (motion as MotionType | null)}
          speed={speed}
          intensity={intensity}
          motionSettings={motionSettings as any}
          disableActiveVideoSync
          className="absolute inset-0 h-full w-full"
        />
      )}
      {!(skipOverlay && isVideo) && (
        <AnimationRenderer
          config={{
            ...(cfg as Record<string, unknown>),
            motion: !isCarousel && !stripMotion ? (motion as any) : undefined,
            speed,
            intensity,
            motionSettings,
            preserveUnderlyingMedia: isVideo,
            background: backgroundImage ?? undefined,
          }}
        />
      )}
    </div>
  );
  const bgLayerDesktop = buildBgLayer(false, false);
  // On mobile: skip the AnimationRenderer canvas overlay ONLY for video themes
  // (canvas effects on top of a playing video are too heavy for most phones).
  // Image-based themes must still animate — stripping them makes previews look broken.
  const bgLayerMobile = buildBgLayer(isVideo, isVideo);

  // Tip-page content — shared between mobile and desktop
  const tipContent = (
    <>
      {/* Gradient header + floating avatar */}
      <div className="relative">
        <div className="h-28 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
        {hasBackgroundMedia && <div className="absolute inset-0 bg-black/50" />}
        <div className="absolute inset-x-0 top-14 flex justify-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-2xl border text-2xl font-bold"
            style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.15)", color: tc }}
          >
            C
          </div>
        </div>
      </div>

      {/* Name + handle + tip card */}
      <div className="relative px-5 pb-6">
        {hasBackgroundMedia && <div className="absolute inset-0 bg-black/50 pointer-events-none" />}
        <div className="relative z-10">
          <div className="pt-12 text-center mb-5">
            <p className="text-lg font-semibold" style={{ color: tc }}>Creator Name</p>
            <p className="text-sm mt-0.5" style={{ color: muted }}>@handle</p>
          </div>

          <div className="rounded-2xl overflow-hidden relative" style={{ background: cardBg, backdropFilter: cardBackdrop, border }}>
            {cardBgMode === "image" && typeof cfg.cardOverlay === "string" && (
              <div className="absolute inset-0 pointer-events-none z-0" style={{ background: cfg.cardOverlay }} />
            )}
            <div className="relative z-10 p-4">
              <div className="flex justify-end mb-3">
                <div className="h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                  <span className="text-emerald-300 font-semibold text-xs">$</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                {[5, 10, 20].map((v, i) => (
                  <div key={v} className="rounded-lg py-2 text-sm font-semibold text-center"
                    style={i === 0 ? { background: primary, color: "#000" } : { background: inputBg, border, color: tc }}>
                    ${v}
                  </div>
                ))}
              </div>

              <div className="rounded-xl py-2 text-sm font-semibold text-center mb-3" style={{ background: inputBg, border, color: tc }}>Custom</div>

              <p className="text-xs font-medium mb-1.5" style={{ color: tc }}>Leave a note (optional)</p>
              <div className="rounded-xl px-3 py-2 text-xs mb-3 min-h-[40px]" style={{ background: inputBg, border, color: muted }}>
                Say something nice…
              </div>

              <div className="flex items-center justify-between rounded-xl p-2.5 mb-3" style={{ background: inputBg, border }}>
                <span className="text-xs" style={{ color: tc }}>Send anonymously</span>
                <div className="w-9 h-5 rounded-full bg-blue-500 relative flex-shrink-0">
                  <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] right-[3px]" />
                </div>
              </div>

              <div className="rounded-xl p-3" style={{ background: inputBg, border }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: tc }}>Secure payment</div>
                    <div className="text-[10px]" style={{ color: muted }}>Powered by Stripe</div>
                  </div>
                </div>
                <div className="w-full rounded-xl py-2.5 text-sm font-semibold text-center" style={{ background: primary, color: "#000" }}>
                  Continue to payment
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[9999]">

      {/* ════════════════════════════════════════════
          MOBILE  <  md  — full-screen slide-up sheet
          ════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 flex flex-col md:hidden"
        style={{
          background: pageBg,
          color: tc,
          transform: isVisible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          willChange: "transform",
          contain: "layout style",
        }}
      >
        {/* Only mount when slide-in is done AND viewport is mobile — prevents
            the CSS-hidden desktop tree from double-mounting canvas effects */}
        {!isDesktop && mediaReady && bgLayerMobile}

        {/* Safe-area top bar — gradient fades into content */}
        <div
          className="relative z-20 shrink-0 flex items-center justify-between px-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent"
          style={{ paddingTop: "max(3rem, env(safe-area-inset-top, 3rem))", paddingBottom: "1.25rem" }}
        >
          <div>
            <p className="text-sm font-bold text-white leading-tight">{theme.name}</p>
            <p className="text-[11px] text-white/40 mt-0.5">How it looks on your tip page</p>
          </div>
          <button
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 border border-white/15 text-white active:scale-90 transition-transform"
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable page content */}
        <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain" style={{ color: tc }}>
          {tipContent}
          {/* bottom padding so last card element clears the buy bar */}
          <div className="h-4" />
        </div>

        {/* Safe-area buy CTA — solid bg, no backdrop-blur (expensive on mobile) */}
        <div
          className="relative z-20 shrink-0 border-t border-white/10 bg-[#060D1F] px-4 pt-4"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/35">Price</p>
              <p className="text-xl font-black text-white leading-tight">{theme.priceLabel}</p>
            </div>
            <button
              onClick={theme.onAction}
              disabled={theme.actionDisabled}
              className="shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {theme.actionLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          DESKTOP  ≥  md  — centered phone shell
          ════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 hidden md:flex items-center justify-center"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" onClick={handleClose} aria-hidden />

        {/* Phone shell column */}
        <div
          className="relative z-10 flex w-full max-w-sm flex-col mx-4"
          style={{
            maxHeight: "95dvh",
            transform: isVisible ? "scale(1)" : "scale(0.96)",
            transition: "opacity 0.25s ease, transform 0.25s ease",
          }}
        >
          {/* Top bar */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-white leading-tight">{theme.name}</p>
              <p className="text-[11px] text-white/40 mt-0.5">Preview · How it looks on your page</p>
            </div>
            <button
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white transition hover:bg-white/15 active:scale-90"
              aria-label="Close preview"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* iPhone shell */}
          <div className="flex-1 overflow-hidden rounded-[42px] border-[7px] border-[#2a2a2e] bg-[#1a1a1e] shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_24px_80px_rgba(0,0,0,0.8)] relative">
            {/* Notch */}
            <div className="absolute top-0 inset-x-0 z-20 flex justify-center pt-1.5 pointer-events-none">
              <div className="w-24 h-6 bg-[#1a1a1e] rounded-b-2xl" />
            </div>
            {/* Side buttons */}
            <div className="absolute -left-[9px] top-24 w-1.5 h-7 bg-[#2a2a2e] rounded-l-sm" />
            <div className="absolute -left-[9px] top-36 w-1.5 h-11 bg-[#2a2a2e] rounded-l-sm" />
            <div className="absolute -left-[9px] top-52 w-1.5 h-11 bg-[#2a2a2e] rounded-l-sm" />
            <div className="absolute -right-[9px] top-32 w-1.5 h-14 bg-[#2a2a2e] rounded-r-sm" />

            {/* Phone screen */}
            <div
              className="relative overflow-y-auto"
              style={{ maxHeight: "calc(95dvh - 160px)", background: pageBg, color: tc }}
            >
              {/* Only mount on desktop — avoids mounting canvas RAF loops on mobile */}
              {isDesktop && mediaReady && bgLayerDesktop}
              <div className="relative z-10 pt-6">
                {tipContent}
              </div>
            </div>

            {/* Home bar */}
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
              <div className="w-20 h-1 bg-white/25 rounded-full" />
            </div>
          </div>

          {/* Buy bar */}
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1424]/90 px-4 py-3 backdrop-blur-sm">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/35">Price</p>
              <p className="text-xl font-black text-white leading-tight">{theme.priceLabel}</p>
            </div>
            <button
              onClick={theme.onAction}
              disabled={theme.actionDisabled}
              className="shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-white/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {theme.actionLabel}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
