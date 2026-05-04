"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useInView,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import {
  Zap,
  Shield,
  Palette,
  DollarSign,
  ArrowRight,
  Star,
  TrendingUp,
  CreditCard,
  Globe,
  Heart,
  Sparkles,
  Users,
  Play,
  MousePointer,
  Eye,
} from "lucide-react";
import Footer from "@/components/Footer";

/* ─────────────────────────────────────────────────────────────────── */
/*  ANIMATION PRIMITIVES                                              */
/* ─────────────────────────────────────────────────────────────────── */

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/** true on <640 px (sm breakpoint) — disables layout-shifting animations */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mobile = useIsMobile();
  return (
    <motion.div
      ref={ref}
      initial={mobile ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      animate={mobile ? { opacity: 1, y: 0 } : inView ? { opacity: 1, y: 0 } : undefined}
      transition={mobile ? { duration: 0 } : { duration: 0.6, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ScaleIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mobile = useIsMobile();
  return (
    <motion.div
      ref={ref}
      initial={mobile ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
      animate={mobile ? { opacity: 1, scale: 1 } : inView ? { opacity: 1, scale: 1 } : undefined}
      transition={mobile ? { duration: 0 } : { duration: 0.5, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Animated counter (earnings style) ───────────────────────────── */

function AnimatedNumber({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) =>
    `${prefix}${v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${suffix}`
  );

  useEffect(() => {
    if (!inView) return;
    const ctrl = animate(mv, target, { duration, ease: "easeOut" });
    return () => ctrl.stop();
  }, [inView, target, mv, duration]);

  return (
    <motion.span ref={ref}>
      <motion.span>{display}</motion.span>
    </motion.span>
  );
}

/* ─── Floating particles ──────────────────────────────────────────── */

// Deterministic seed data to avoid SSR/client hydration mismatch
const PARTICLE_DATA = [
  { w: 4.2, h: 3.8, x: 12, y: 64, drift: 52, dur: 7.2, del: 1.1 },
  { w: 3.1, h: 5.0, x: 30, y: 37, drift: 68, dur: 5.8, del: 0.3 },
  { w: 5.4, h: 3.5, x: 10, y: 70, drift: 44, dur: 8.4, del: 2.6 },
  { w: 3.2, h: 2.6, x: 37, y: 59, drift: 56, dur: 6.1, del: 3.5 },
  { w: 2.6, h: 2.8, x: 86, y: 47, drift: 38, dur: 9.2, del: 0.8 },
  { w: 4.4, h: 2.8, x: 24, y: 97, drift: 72, dur: 4.6, del: 1.9 },
  { w: 3.7, h: 2.1, x: 20, y: 31, drift: 60, dur: 7.8, del: 3.1 },
  { w: 4.7, h: 4.5, x: 17, y: 7, drift: 48, dur: 5.3, del: 0.5 },
  { w: 2.9, h: 3.8, x: 74, y: 76, drift: 55, dur: 8.9, del: 2.2 },
  { w: 3.9, h: 4.1, x: 50, y: 70, drift: 42, dur: 6.7, del: 1.6 },
  { w: 4.2, h: 2.5, x: 99, y: 77, drift: 66, dur: 5.1, del: 3.8 },
  { w: 3.2, h: 5.8, x: 53, y: 84, drift: 50, dur: 7.5, del: 0.9 },
  { w: 4.4, h: 2.1, x: 20, y: 31, drift: 58, dur: 9.6, del: 2.4 },
  { w: 3.2, h: 2.2, x: 39, y: 24, drift: 46, dur: 4.9, del: 1.3 },
  { w: 3.4, h: 3.3, x: 95, y: 37, drift: 64, dur: 8.1, del: 3.3 },
  { w: 4.8, h: 4.8, x: 12, y: 20, drift: 40, dur: 6.4, del: 0.7 },
  { w: 3.2, h: 3.9, x: 27, y: 24, drift: 70, dur: 5.6, del: 2.8 },
  { w: 5.9, h: 2.4, x: 61, y: 42, drift: 54, dur: 7.0, del: 1.5 },
];

function Particles() {
  const mobile = useIsMobile();
  if (mobile) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLE_DATA.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-blue-400/20"
          style={{
            width: p.w,
            height: p.h,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            opacity: [0.15, 0.45, 0.15],
          }}
          transition={{
            duration: p.dur,
            repeat: Infinity,
            delay: p.del,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Live tip-feed simulation ────────────────────────────────────── */

const DEMO_TIPS = [
  { name: "Alex M.", amount: "$10.00", note: "Great work!" },
  { name: "Anonymous", amount: "$5.00", note: "" },
  { name: "Sam R.", amount: "$25.00", note: "You're awesome 🎉" },
  { name: "Casey T.", amount: "$15.00", note: "Keep it up!" },
  { name: "Morgan L.", amount: "$7.50", note: "Thanks!" },
  { name: "Taylor H.", amount: "$20.00", note: "Best barista ☕" },
  { name: "Anonymous", amount: "$3.00", note: "" },
  { name: "Riley P.", amount: "$50.00", note: "Amazing work!" },
];

function LiveTipFeed() {
  const [tips, setTips] = useState<typeof DEMO_TIPS>([]);

  useEffect(() => {
    let idx = 0;
    const iv = setInterval(() => {
      setTips((prev) => {
        const next = [DEMO_TIPS[idx % DEMO_TIPS.length], ...prev].slice(0, 4);
        idx++;
        return next;
      });
    }, 2200);
    // kick off first immediately
    setTips([DEMO_TIPS[0]]);
    idx = 1;
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="space-y-2 mt-3 overflow-hidden" style={{ minHeight: 140 }}>
      <AnimatePresence initial={false}>
        {tips.map((t, i) => (
          <motion.div
            key={`${t.name}-${t.amount}-${i}`}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease }}
            className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/8 px-3 py-2"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500/40 to-cyan-400/40 flex items-center justify-center text-[10px] font-bold text-white/80 shrink-0">
              {t.name === "Anonymous" ? "?" : t.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-white/70 truncate">{t.name}</span>
                <span className="text-xs font-bold text-emerald-400">{t.amount}</span>
              </div>
              {t.note && <p className="text-[10px] text-white/55 truncate">{t.note}</p>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Interactive tip preview card ────────────────────────────────── */

const THEME_PRESETS = [
  { key: "default", label: "Classic", button: "from-blue-500 to-blue-700", glow: "blue", active: "bg-blue-500/20 border-blue-400/30 text-blue-200" },
  { key: "aurora", label: "Aurora", button: "from-purple-500 to-indigo-500", glow: "purple", active: "bg-purple-500/20 border-purple-400/30 text-purple-200" },
  { key: "bold", label: "Bold", button: "from-red-500 to-red-700", glow: "red", active: "bg-red-500/20 border-red-400/30 text-red-200" },
  { key: "pink_luxe", label: "Pink", button: "from-pink-500 to-pink-700", glow: "pink", active: "bg-pink-500/20 border-pink-400/30 text-pink-200" },
] as const;

const GLOW_COLORS: Record<string, string> = {
  blue: "rgba(59,130,246,0.25)",
  purple: "rgba(139,92,246,0.25)",
  red: "rgba(239,68,68,0.25)",
  pink: "rgba(236,72,153,0.25)",
};

function InteractivePreviewCard() {
  const [selectedAmount, setSelectedAmount] = useState(1);
  const [themeIdx, setThemeIdx] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const theme = THEME_PRESETS[themeIdx];
  const amounts = [5, 10, 20];

  return (
    <div className="relative">
      {/* floating glow behind card */}
      <motion.div
        className="absolute -inset-6 rounded-3xl blur-[80px] pointer-events-none"
        animate={{
          backgroundColor: GLOW_COLORS[theme.glow],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ backgroundColor: { duration: 0.5 }, opacity: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
      />

      <motion.div
        className="relative rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
      >
        {/* gradient header */}
        <motion.div
          className="h-11 bg-gradient-to-r from-purple-400/30 via-pink-300/25 to-amber-300/25"
          layoutId="cardHeader"
        />
        <div className="p-5 -mt-5">
          {/* avatar */}
          <motion.div
            className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 border-2 border-white/20 mx-auto flex items-center justify-center text-white font-bold text-lg shadow-lg"
            whileHover={{ scale: 1.08 }}
          >
            J
          </motion.div>
          <p className="text-center font-semibold mt-2 text-white/90">@jessicaK</p>
          <p className="text-center text-sm text-white/45">Barista &middot; Portland</p>

          {/* theme switcher pills */}
          <div className="flex gap-1.5 justify-center mt-3">
            {THEME_PRESETS.map((t, i) => (
              <motion.button
                key={t.key}
                onClick={() => setThemeIdx(i)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-200 ${
                  i === themeIdx
                    ? t.active
                    : "bg-white/5 border-white/[0.12] text-white/55 hover:text-white/60"
                }`}
                whileTap={{ scale: 0.93 }}
              >
                {t.label}
              </motion.button>
            ))}
          </div>

          {/* tip amounts */}
          <div className="flex gap-2 mt-4">
            {amounts.map((amt, i) => (
              <motion.button
                key={amt}
                onClick={() => setSelectedAmount(i)}
                className={`flex-1 rounded-xl py-2.5 text-center text-sm font-semibold transition-all duration-200 border ${
                  i === selectedAmount
                    ? theme.active
                    : "bg-white/8 border-white/[0.12] text-white/80 hover:bg-white/12"
                }`}
                whileTap={{ scale: 0.95 }}
              >
                ${amt}
              </motion.button>
            ))}
          </div>

          {/* send button */}
          <motion.button
            className={`w-full mt-4 rounded-xl bg-gradient-to-b ${theme.button} py-3 text-center text-sm font-semibold text-white`}
            style={{ boxShadow: `0 8px 24px ${GLOW_COLORS[theme.glow]}` }}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.015 }}
            onClick={() => setDemoMode((p) => !p)}
          >
            {demoMode ? "Live Preview ✨" : "Send Tip"}
          </motion.button>

          {/* demo mode — live tip feed */}
          <AnimatePresence>
            {demoMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35 }}
              >
                <LiveTipFeed />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Homepage live tip feed (bigger, bolder) ─────────────────────── */

const HOMEPAGE_TIPS = [
  { name: "Jordan M.", amount: "$20.00", emoji: "🎉" },
  { name: "Anonymous", amount: "$5.00", emoji: "💚" },
  { name: "Sam R.", amount: "$25.00", emoji: "🔥" },
  { name: "Casey T.", amount: "$15.00", emoji: "☕" },
  { name: "Morgan L.", amount: "$7.50", emoji: "💜" },
  { name: "Taylor H.", amount: "$50.00", emoji: "🌟" },
  { name: "Anonymous", amount: "$3.00", emoji: "✨" },
  { name: "Riley P.", amount: "$100.00", emoji: "🚀" },
  { name: "Alex K.", amount: "$12.00", emoji: "🎶" },
  { name: "Jamie S.", amount: "$8.00", emoji: "💛" },
];

function HomepageTipFeed() {
  const [tips, setTips] = useState<(typeof HOMEPAGE_TIPS)[number][]>([]);

  useEffect(() => {
    let idx = 0;
    const iv = setInterval(() => {
      setTips((prev) => {
        const next = [HOMEPAGE_TIPS[idx % HOMEPAGE_TIPS.length], ...prev].slice(0, 5);
        idx++;
        return next;
      });
    }, 2200);
    setTips([HOMEPAGE_TIPS[0]]);
    idx = 1;
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="space-y-2" style={{ minHeight: 200 }}>
      <AnimatePresence initial={false}>
        {tips.map((t, i) => (
          <motion.div
            key={`${t.name}-${t.amount}-${i}-${tips.length}`}
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease }}
            className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/8 px-4 py-3"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/40 to-cyan-400/40 flex items-center justify-center text-sm font-bold text-white/80 shrink-0">
              {t.name === "Anonymous" ? "?" : t.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-white/70 truncate">{t.name}</span>
                <span className="text-sm font-bold text-emerald-400">{t.amount}</span>
              </div>
              <p className="text-xs text-white/55">{t.name} tipped {t.emoji}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Theme showcase with live preview ────────────────────────────── */

const SHOWCASE_THEMES = [
  { key: "default", label: "Classic", bg: "bg-[#050A1A]", button: "bg-gradient-to-b from-blue-500 to-blue-700", pill: "bg-blue-500/20 border-blue-400/30 text-blue-300", glow: "rgba(59,130,246,0.2)" },
  { key: "aurora", label: "Aurora", bg: "bg-[#0d0520]", button: "bg-gradient-to-r from-purple-500 to-indigo-500", pill: "bg-purple-500/20 border-purple-400/30 text-purple-300", glow: "rgba(139,92,246,0.2)" },
  { key: "pink_luxe", label: "Pink Luxe", bg: "bg-[#1a0a14]", button: "bg-gradient-to-b from-pink-500 to-pink-700", pill: "bg-pink-500/20 border-pink-400/30 text-pink-300", glow: "rgba(236,72,153,0.2)" },
  { key: "army_black", label: "Army", bg: "bg-[#0a0d08]", button: "bg-gradient-to-b from-emerald-600 to-emerald-800", pill: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300", glow: "rgba(16,185,129,0.2)" },
  { key: "bold", label: "Bold Red", bg: "bg-[#1a0505]", button: "bg-gradient-to-b from-red-500 to-red-700", pill: "bg-red-500/20 border-red-400/30 text-red-300", glow: "rgba(239,68,68,0.2)" },
  { key: "glitter", label: "Glitter", bg: "bg-[#0a0a1a]", button: "bg-gradient-to-r from-yellow-400 to-amber-500 text-black", pill: "bg-yellow-500/20 border-yellow-400/30 text-yellow-300", glow: "rgba(234,179,8,0.2)" },
] as const;

function ThemeShowcase() {
  const [active, setActive] = useState(0);
  const t = SHOWCASE_THEMES[active];

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Theme pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {SHOWCASE_THEMES.map((th, i) => (
          <motion.button
            key={th.key}
            onClick={() => setActive(i)}
            className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all duration-200 ${
              i === active ? th.pill : "bg-white/5 border-white/[0.12] text-white/55 hover:text-white/60"
            }`}
            whileTap={{ scale: 0.93 }}
          >
            {th.label}
          </motion.button>
        ))}
      </div>

      {/* Live mini-preview */}
      <div className="relative w-full max-w-sm mx-auto">
        <motion.div
          className="absolute -inset-6 rounded-3xl blur-[60px] pointer-events-none"
          animate={{ backgroundColor: t.glow, opacity: [0.5, 0.8, 0.5] }}
          transition={{ backgroundColor: { duration: 0.4 }, opacity: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
        />
        <motion.div
          className={`relative rounded-2xl border border-white/[0.12] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] ${t.bg} transition-colors duration-300`}
          layout
        >
          {/* gradient header */}
          <div className="h-16 bg-gradient-to-r from-purple-400/30 via-pink-300/25 to-amber-300/25" />
          <div className="px-5 pb-5 -mt-5">
            <motion.div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 border-2 border-white/20 mx-auto flex items-center justify-center text-white font-bold text-lg shadow-lg"
              key={t.key}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              J
            </motion.div>
            <p className="text-center font-semibold mt-2 text-white/90 text-sm">@jessicaK</p>
            <p className="text-center text-xs text-white/55">Barista &middot; Portland</p>

            {/* tip amounts */}
            <div className="flex gap-2 mt-4">
              {[5, 10, 20].map((amt, i) => (
                <motion.div
                  key={amt}
                  className={`flex-1 rounded-xl py-2.5 text-center text-xs font-semibold transition-all border ${
                    i === 1 ? t.button + " text-white" : "bg-white/5 border-white/[0.12] text-white/70"
                  }`}
                >
                  ${amt}
                </motion.div>
              ))}
            </div>

            {/* send button */}
            <motion.div
              className={`w-full mt-3 rounded-xl ${t.button} py-2.5 text-center text-xs font-semibold text-white`}
              key={`btn-${t.key}`}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
            >
              Send Tip
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2 text-xs text-white/50">
        <Eye size={12} />
        <span>Preview only &middot; <Link href="/demo" className="text-blue-400 hover:text-blue-300 transition">Try the full demo →</Link></span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  PAGE                                                              */
/* ─────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <div className="relative overflow-x-hidden">
      {/* ━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative flex flex-col items-center pt-10 sm:pt-16 pb-16 sm:pb-28 px-5 sm:px-4 text-center overflow-hidden">
        {/* animated background glows — hidden on mobile to prevent layout bounce */}
        <motion.div
          className="hidden sm:block pointer-events-none absolute top-[-160px] left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-blue-500/15 blur-[180px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />
        <motion.div
          className="hidden sm:block pointer-events-none absolute top-[60px] -right-[200px] h-[400px] w-[400px] rounded-full bg-purple-500/10 blur-[120px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 2.5, ease: "easeOut" }}
        />
        <motion.div
          className="hidden sm:block pointer-events-none absolute top-[200px] -left-[150px] h-[350px] w-[350px] rounded-full bg-cyan-400/8 blur-[100px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 2, ease: "easeOut", delay: 0.5 }}
        />
        <Particles />

        {/* neon glow wave — animated border line */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 overflow-hidden h-[3px]">
          <motion.div
            className="h-full w-[200%] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent"
            animate={{ x: ["-50%", "0%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <FadeUp>
          <Image
            src="/1nelink-logo-clean.png"
            alt="1neLink"
            width={180}
            height={48}
            className="mx-auto mb-4 sm:mb-6 drop-shadow-[0_0_25px_rgba(0,224,255,0.4)] w-[140px] sm:w-[180px] h-auto"
            priority
          />
        </FadeUp>

        <FadeUp delay={0.1}>
          <h1 className="text-[2rem] sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.12] max-w-4xl mx-auto">
            Get paid instantly with your personal{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              1neLink
            </span>
          </h1>
        </FadeUp>

        {/* Key conversion line */}
        <FadeUp delay={0.18}>
          <p className="mt-4 text-base sm:text-lg md:text-xl text-white/60 max-w-xl mx-auto leading-relaxed">
            <span className="text-emerald-400 font-medium animate-pulse">
              No account needed.
            </span>{" "}
            Just tap &amp; pay.
          </p>
        </FadeUp>

        <FadeUp delay={0.22}>
          <p className="mt-2 text-sm sm:text-base text-white/45 max-w-lg mx-auto leading-relaxed px-2 sm:px-0">
            The fastest way for creators, baristas, streamers &amp; service workers to
            receive tips — with instant payouts, zero hassle.
          </p>
        </FadeUp>

        {/* hero earnings counter */}
        <FadeUp delay={0.28}>
          <div className="mt-6 flex items-center gap-2 text-sm text-white/50">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <AnimatedNumber target={124847} prefix="$" suffix=" paid out to creators" decimals={0} duration={2.5} />
          </div>
        </FadeUp>

        <FadeUp delay={0.35} className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full px-2 sm:px-0 sm:w-auto">
          <Link
            href="/signup"
            className="group relative rounded-xl px-7 py-3.5 font-semibold text-black bg-emerald-500 shadow-[0_10px_30px_rgba(16,185,129,0.3)] hover:shadow-[0_14px_44px_rgba(16,185,129,0.5)] hover:bg-emerald-400 transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden w-full sm:w-auto"
          >
            <motion.span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
            />
            <span className="relative z-10 flex items-center gap-2">
              Create Your Link
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
          <Link
            href="/demo"
            className="group rounded-xl px-7 py-3.5 font-semibold text-white bg-white/8 hover:bg-white/12 border border-white/[0.12] transition-all duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Play size={16} className="text-blue-400" />
            Try Demo
          </Link>
          <Link
            href="/login"
            className="rounded-xl px-7 py-3.5 font-semibold text-white/60 hover:text-white/80 transition-all duration-300 text-center w-full sm:w-auto"
          >
            Sign In
          </Link>
        </FadeUp>

        {/* Trust row */}
        <FadeUp delay={0.42}>
          <div className="mt-6 text-xs text-white/55 flex items-center justify-center gap-3 flex-wrap">
            <span>Secure checkout</span>
            <span className="text-white/20">&middot;</span>
            <span>Instant payments</span>
            <span className="text-white/20">&middot;</span>
            <span>No signup required</span>
          </div>
        </FadeUp>

        {/* ─── Interactive preview card ─── */}
        <FadeUp delay={0.5} className="mt-10 sm:mt-16 w-full max-w-sm mx-auto px-2 sm:px-0">
          <InteractivePreviewCard />
        </FadeUp>

        {/* "Try Demo" hint under card */}
        <FadeUp delay={0.7}>
          <Link href="/demo">
            <motion.p
              className="mt-4 text-xs text-white/50 flex items-center gap-1.5 hover:text-white/50 transition cursor-pointer"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Play size={10} /> Try the full interactive demo →
            </motion.p>
          </Link>
        </FadeUp>
      </section>

      {/* ━━━ SOCIAL PROOF TICKER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-b border-white/8 bg-white/[0.02] overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
            {[
              { icon: <Users size={18} />, value: 2384, suffix: "+", label: "Creators", color: "text-blue-400" },
              { icon: <DollarSign size={18} />, value: 124847, prefix: "$", label: "Paid Out", color: "text-emerald-400" },
              { icon: <Heart size={18} />, value: 38400, suffix: "+", label: "Tips Sent", color: "text-pink-400" },
              { icon: <Sparkles size={18} />, value: 99, suffix: "%", label: "Uptime", color: "text-cyan-400" },
            ].map((s, i) => (
              <FadeUp key={s.label} delay={i * 0.1}>
                <div className="flex flex-col items-center gap-1">
                  <span className={s.color}>{s.icon}</span>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                    <AnimatedNumber target={s.value} prefix={s.prefix || ""} suffix={s.suffix || ""} duration={2} />
                  </div>
                  <span className="text-xs text-white/45">{s.label}</span>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ LIVE TIP FEED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <FadeUp>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-3">
              Tips Are Coming In{" "}
              <span className="text-emerald-400">Right Now</span>
            </h2>
            <p className="text-center text-white/50 max-w-md mx-auto mb-10">
              See real-time tips flowing to creators on the platform.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {/* Feed panel */}
            <ScaleIn>
              <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <motion.div
                    className="w-2.5 h-2.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-sm font-semibold text-white/60">Live Feed</span>
                </div>
                <HomepageTipFeed />
              </div>
            </ScaleIn>

            {/* Stats panel */}
            <ScaleIn delay={0.15}>
              <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-5 flex flex-col justify-between h-full">
                <div>
                  <p className="text-sm text-white/45 mb-1">Tips in the last hour</p>
                  <div className="text-3xl sm:text-4xl font-bold text-emerald-400">
                    <AnimatedNumber target={142} duration={2} />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-emerald-400 text-xs font-medium">
                    <TrendingUp size={12} />
                    +18% vs yesterday
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {[
                    { label: "Largest tip today", value: "$100.00", color: "text-yellow-400" },
                    { label: "Most tipped creator", value: "@jessicaK", color: "text-blue-400" },
                    { label: "Avg tip amount", value: "$12.84", color: "text-cyan-400" },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between items-center">
                      <span className="text-xs text-white/55">{s.label}</span>
                      <span className={`text-sm font-semibold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ScaleIn>
          </div>
        </div>
      </section>

      {/* ━━━ TRY DEMO CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative border-t border-b border-white/8 overflow-hidden">
        <motion.div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10 max-w-3xl mx-auto px-4 py-16 text-center">
          <FadeUp>
            <motion.div
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/[0.12] flex items-center justify-center mx-auto mb-5"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <MousePointer size={24} className="text-blue-400" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
              Try It <span className="text-blue-400">Right Now</span>
            </h2>
            <p className="text-white/50 max-w-md mx-auto mb-8">
              Experience the full tipping flow — pick an amount, send a tip, see
              the success animation. No account needed.
            </p>
          </FadeUp>
          <FadeUp delay={0.15}>
            <Link
              href="/demo"
              className="group relative inline-flex items-center gap-2.5 rounded-xl px-6 sm:px-8 py-3.5 sm:py-4 font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_12px_36px_rgba(59,130,246,0.4)] hover:shadow-[0_16px_48px_rgba(59,130,246,0.6)] hover:from-blue-400 hover:to-blue-600 transition-all duration-300 text-base sm:text-lg overflow-hidden"
            >
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
              />
              <span className="relative z-10 flex items-center gap-2.5">
                <Play size={18} />
                Launch Interactive Demo
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </FadeUp>
          <FadeUp delay={0.25}>
            <p className="mt-4 text-xs text-white/45">Free &middot; No sign-up &middot; 30 seconds</p>
          </FadeUp>
        </div>
      </section>

      {/* ━━━ THEME PREVIEW SWITCHER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-5xl mx-auto px-4 py-24">
        <FadeUp>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-3">
            14 Premium <span className="text-purple-400">Themes</span>
          </h2>
          <p className="text-center text-white/50 max-w-md mx-auto mb-10">
            Customize your tip page to match your brand. Switch themes instantly.
          </p>
        </FadeUp>
        <FadeUp delay={0.1}>
          <ThemeShowcase />
        </FadeUp>
      </section>

      {/* ━━━ FEATURES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-5xl mx-auto px-4 py-24">
        <FadeUp>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4">
            Everything You Need to{" "}
            <span className="text-blue-400">Earn More</span>
          </h2>
          <p className="text-center text-white/50 max-w-lg mx-auto mb-14">
            Built for speed, security, and simplicity — so you can focus on
            what you do best.
          </p>
        </FadeUp>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: <Zap size={22} />, title: "Instant Payouts", desc: "Withdraw tips to your bank or debit card in minutes — not days.", accent: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
            { icon: <Shield size={22} />, title: "Bank-Grade Security", desc: "256-bit encryption, Stripe-powered payments, fraud detection built in.", accent: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
            { icon: <Palette size={22} />, title: "Custom Themes", desc: "14 premium themes to match your brand — Aurora, Glitter, Army & more.", accent: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
            { icon: <CreditCard size={22} />, title: "No App Required", desc: "Supporters tip via any browser — no account or download needed.", accent: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
            { icon: <TrendingUp size={22} />, title: "Earnings Dashboard", desc: "Track every tip, view analytics, and set earning goals in real time.", accent: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
            { icon: <Globe size={22} />, title: "Public Tip Page", desc: "Get your own 1nelink.com/handle — share it anywhere, get tipped everywhere.", accent: "text-pink-400 bg-pink-400/10 border-pink-400/20" },
          ].map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.08}>
              <motion.div
                className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-6 h-full group cursor-default"
                whileHover={{ y: -4, backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.2)" }}
                transition={{ duration: 0.25 }}
              >
                <motion.div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${f.accent}`}
                  whileHover={{ scale: 1.12, rotate: 4 }}
                >
                  {f.icon}
                </motion.div>
                <h3 className="font-semibold text-lg mb-1.5">{f.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{f.desc}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ━━━ HOW IT WORKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-white/8 bg-white/[0.015] relative overflow-hidden">
        {/* subtle wave accent */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
          <motion.div
            className="h-full w-[200%] bg-gradient-to-r from-transparent via-blue-400/40 to-transparent"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 py-24 text-center">
          <FadeUp>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-14">
              Three Steps to{" "}
              <span className="text-cyan-400">Start Earning</span>
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              { step: "01", title: "Create Your Page", desc: "Sign up and claim your unique handle in under 60 seconds." },
              { step: "02", title: "Share Your Link", desc: "Post 1nelink.com/you on socials, in your bio, or at your register." },
              { step: "03", title: "Get Paid", desc: "Tips hit your dashboard instantly — withdraw anytime." },
            ].map((s, i) => (
              <FadeUp key={s.step} delay={i * 0.15}>
                <motion.div
                  className="flex flex-col items-center"
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <motion.div
                    className="text-4xl sm:text-5xl font-black text-blue-500/20 mb-3 font-mono"
                    whileHover={{ scale: 1.1, color: "rgba(59,130,246,0.35)" }}
                  >
                    {s.step}
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed max-w-[240px]">{s.desc}</p>
                </motion.div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ EARNINGS SHOWCASE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="max-w-4xl mx-auto px-4 py-24">
        <FadeUp>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4">
            Watch Your <span className="text-emerald-400">Earnings Grow</span>
          </h2>
          <p className="text-center text-white/50 max-w-md mx-auto mb-12">
            Real creators, real results. Here&rsquo;s what a typical week looks like.
          </p>
        </FadeUp>

        <ScaleIn delay={0.1}>
          <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 sm:p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
              {/* big earnings number */}
              <div>
                <p className="text-sm text-white/45 mb-1">This Week&rsquo;s Earnings</p>
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-emerald-400">
                  <AnimatedNumber target={736.23} prefix="$" decimals={2} duration={2.5} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
                    <TrendingUp size={14} />
                    +32%
                  </div>
                  <span className="text-xs text-white/50">vs last week</span>
                </div>
              </div>

              {/* mini stats */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center">
                {[
                  { label: "Tips", value: 47, color: "text-blue-400" },
                  { label: "Avg Tip", value: 15.66, color: "text-cyan-400", prefix: "$", decimals: 2 },
                  { label: "Top Tip", value: 50, color: "text-yellow-400", prefix: "$" },
                ].map((m) => (
                  <div key={m.label}>
                    <div className={`text-xl sm:text-2xl font-bold ${m.color}`}>
                      <AnimatedNumber target={m.value} prefix={m.prefix || ""} decimals={m.decimals || 0} />
                    </div>
                    <div className="text-xs text-white/55 mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScaleIn>
      </section>

      {/* ━━━ SOCIAL PROOF / TESTIMONIALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-white/8 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto px-4 py-24">
          <FadeUp>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-12">
              Loved by <span className="text-yellow-400">Creators</span>
            </h2>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[
              { quote: "I made $200 in tips my first week. The instant payout is a game changer.", name: "Mia T.", role: "Barista", avatar: "M" },
              { quote: "Finally a tipping platform that looks professional. My audience loves the themes.", name: "Derek L.", role: "Streamer", avatar: "D" },
              { quote: "Setup took 2 minutes. I put my link on my register and tips just started rolling in.", name: "Priya K.", role: "Tattoo Artist", avatar: "P" },
            ].map((t, i) => (
              <FadeUp key={t.name} delay={i * 0.1}>
                <motion.div
                  className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-6 h-full"
                  whileHover={{ y: -4, borderColor: "rgba(255,255,255,0.2)" }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex gap-0.5 mb-3">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} size={14} className="fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/40 to-cyan-400/40 flex items-center justify-center text-xs font-bold text-white/80">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-white/55">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ SOCIAL PROOF STRIP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-t border-b border-white/8 bg-white/[0.02] overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-10">
            {[
              { text: "$124K+ paid out", icon: <DollarSign size={14} />, color: "text-emerald-400" },
              { text: "2,300+ creators", icon: <Users size={14} />, color: "text-blue-400" },
              { text: "Growing daily", icon: <TrendingUp size={14} />, color: "text-cyan-400" },
              { text: "Instant payouts", icon: <Zap size={14} />, color: "text-yellow-400" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2">
                <span className={item.color}>{item.icon}</span>
                <span className="text-sm font-semibold text-white/60">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden">
        {/* cta glow — hidden on mobile */}
        <div
          className="hidden sm:block pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-blue-500/10 blur-[160px] opacity-40"
        />

        <div className="max-w-2xl mx-auto px-4 py-28 text-center relative z-10">
          <FadeUp>
            <motion.div
              className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center mx-auto mb-6"
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <DollarSign size={28} className="text-blue-400" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Ready to Start Earning?
            </h2>
            <p className="text-white/50 mb-8 max-w-md mx-auto">
              Join thousands of creators already using 1neLink. Free to sign up,
              no monthly fees, withdraw instantly.
            </p>
          </FadeUp>
          <FadeUp delay={0.15}>
            <Link
              href="/signup"
              className="group relative inline-flex items-center gap-2 rounded-xl px-6 sm:px-8 py-3.5 sm:py-4 font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_12px_36px_rgba(59,130,246,0.4)] hover:shadow-[0_16px_48px_rgba(59,130,246,0.6)] hover:from-blue-400 hover:to-blue-600 transition-all duration-300 text-base sm:text-lg overflow-hidden"
            >
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
              />
              <span className="relative z-10 flex items-center gap-2">
                Create Your Free Page
                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </FadeUp>
        </div>
      </section>

      <Footer />
    </div>
  );
}
