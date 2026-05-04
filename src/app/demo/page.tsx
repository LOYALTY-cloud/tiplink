"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Check, Heart, Sparkles } from "lucide-react";

/* ── Theme presets for the demo ───────────────────────────────────── */

const THEMES = [
  {
    key: "default",
    label: "Classic",
    bg: "bg-[#050A1A]",
    card: "bg-white/5 backdrop-blur-xl border-white/10",
    button: "bg-gradient-to-b from-blue-500 to-blue-700 text-white",
    buttonGlow: "shadow-[0_8px_24px_rgba(59,130,246,0.35)]",
    inputBg: "bg-white/5 border-white/10",
    muted: "text-white/65",
    muted2: "text-white/45",
    accent: "blue",
    pill: "bg-blue-500/20 border-blue-400/30 text-blue-200",
  },
  {
    key: "aurora",
    label: "Aurora",
    bg: "bg-[#0d0520]",
    card: "bg-white/5 backdrop-blur-xl border-purple-400/20",
    button: "bg-gradient-to-r from-purple-500 to-indigo-500 text-white",
    buttonGlow: "shadow-[0_8px_24px_rgba(139,92,246,0.35)]",
    inputBg: "bg-white/5 border-purple-400/15",
    muted: "text-white/65",
    muted2: "text-white/40",
    accent: "purple",
    pill: "bg-purple-500/20 border-purple-400/30 text-purple-200",
  },
  {
    key: "pink_luxe",
    label: "Pink Luxe",
    bg: "bg-[#1a0a14]",
    card: "bg-white/5 backdrop-blur-xl border-pink-400/20",
    button: "bg-gradient-to-b from-pink-500 to-pink-700 text-white",
    buttonGlow: "shadow-[0_8px_24px_rgba(236,72,153,0.35)]",
    inputBg: "bg-white/5 border-pink-400/15",
    muted: "text-white/65",
    muted2: "text-white/40",
    accent: "pink",
    pill: "bg-pink-500/20 border-pink-400/30 text-pink-200",
  },
  {
    key: "army_black",
    label: "Army",
    bg: "bg-[url('/themes/army-black.png')] bg-cover bg-center",
    card: "bg-white/5 backdrop-blur-xl border-white/10",
    button: "bg-white text-black",
    buttonGlow: "shadow-[0_0_25px_rgba(255,255,255,0.15)]",
    inputBg: "bg-white/10 border-white/10",
    muted: "text-white/65",
    muted2: "text-white/45",
    accent: "white",
    pill: "bg-white/10 border-white/20 text-white/80",
    wrapper: "bg-black/60 backdrop-blur-[2px]",
  },
  {
    key: "bold",
    label: "Bold",
    bg: "bg-[#1a0505]",
    card: "bg-white/5 backdrop-blur-xl border-red-400/20",
    button: "bg-gradient-to-b from-red-500 to-red-700 text-white",
    buttonGlow: "shadow-[0_8px_24px_rgba(239,68,68,0.35)]",
    inputBg: "bg-white/5 border-red-400/15",
    muted: "text-white/65",
    muted2: "text-white/40",
    accent: "red",
    pill: "bg-red-500/20 border-red-400/30 text-red-200",
  },
] as const;

/* ── Fake tip names for the feed ──────────────────────────────────── */

const NAMES = [
  "Jordan M.", "Anonymous", "Taylor S.", "Casey R.", "Alex P.",
  "Morgan K.", "Skyler H.", "Jamie L.", "Riley T.", "Anonymous",
];
const NOTES = [
  "Great work! 🎉", "", "You're the best!", "Keep it up ☕", "",
  "Amazing!", "Love your content 💜", "", "Thanks!", "You rock 🔥",
];

/* ── Success celebration overlay ──────────────────────────────────── */

function SuccessOverlay({
  amount,
  note,
  onClose,
  onViewReceipt,
}: {
  amount: number;
  note: string;
  onClose: () => void;
  onViewReceipt: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="text-center px-6"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 200 }}
      >
        {/* animated check circle */}
        <motion.div
          className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-5"
          style={{ boxShadow: "0 0 40px rgba(34,197,94,0.4)" }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", damping: 12 }}
        >
          <Check className="w-10 h-10 text-emerald-400" strokeWidth={2.5} />
        </motion.div>

        <motion.div
          className="text-white text-2xl font-bold"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          Tip Sent!
        </motion.div>

        <motion.div
          className="text-emerald-400 text-4xl font-bold mt-2"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35, type: "spring", damping: 10 }}
        >
          ${amount.toFixed(2)}
        </motion.div>

        {/* Message preview */}
        {note && (
          <motion.div
            className="mt-3 mx-auto max-w-[260px] rounded-xl bg-white/5 border border-white/10 px-4 py-2.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <p className="text-xs text-white/40 mb-0.5">Your message</p>
            <p className="text-sm text-white/70">&ldquo;{note}&rdquo;</p>
          </motion.div>
        )}

        <motion.p
          className="text-white/50 text-sm mt-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Thank you for your support 💚
        </motion.p>

        <motion.p
          className="text-white/30 text-xs mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          This is a demo — no real payment was made
        </motion.p>

        {/* confetti dots */}
        {Array.from({ length: 16 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 3 === 0 ? 6 : 4,
              height: i % 3 === 0 ? 6 : 4,
              background: ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"][i % 5],
              left: "50%",
              top: "50%",
            }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{
              x: Math.cos((i / 16) * Math.PI * 2) * (100 + (i % 3) * 40),
              y: Math.sin((i / 16) * Math.PI * 2) * (100 + (i % 3) * 40),
              opacity: 0,
            }}
            transition={{ duration: 1, delay: 0.2 }}
          />
        ))}

        <motion.div
          className="mt-6 flex gap-3 justify-center"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <motion.button
            onClick={onViewReceipt}
            className="px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition"
            whileTap={{ scale: 0.97 }}
          >
            View Receipt
          </motion.button>
          <motion.button
            onClick={onClose}
            className="px-6 py-3 rounded-xl bg-white/10 text-white/70 font-semibold text-sm hover:bg-white/15 transition border border-white/10"
            whileTap={{ scale: 0.97 }}
          >
            Send Another
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ── Receipt modal ────────────────────────────────────────────────── */

function ReceiptModal({
  amount,
  note,
  onClose,
}: {
  amount: number;
  note: string;
  onClose: () => void;
}) {
  const fee = amount * 0.029 + 0.30;
  const total = amount + fee;
  const now = new Date();
  const timestamp = now.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const txId = `demo_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl bg-[#0A1128] border border-white/10 overflow-hidden shadow-2xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
      >
        {/* Header */}
        <div className="bg-emerald-500/10 border-b border-emerald-400/20 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
            <Check size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Payment Completed</p>
            <p className="text-xs text-emerald-400/70">{timestamp}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* To */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">
              J
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Jessica Kim</p>
              <p className="text-xs text-white/40">@jessicaK</p>
            </div>
          </div>

          {/* Message */}
          {note && (
            <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
              <p className="text-xs text-white/40 mb-1">Message</p>
              <p className="text-sm text-white/70">&ldquo;{note}&rdquo;</p>
            </div>
          )}

          {/* Breakdown */}
          <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Tip amount</span>
              <span className="text-white/70">${amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Processing fee</span>
              <span className="text-white/70">${fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/8 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-white/60">Total charged</span>
              <span className="text-white">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Transaction ID */}
          <div className="flex justify-between text-xs">
            <span className="text-white/30">Transaction ID</span>
            <span className="text-white/40 font-mono">{txId}</span>
          </div>

          {/* Status */}
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/30">Status</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Completed
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/8 px-5 py-4 flex flex-col gap-3">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition active:scale-[0.98]"
          >
            Done
          </button>
          <p className="text-center text-[10px] text-white/25">
            Powered by 1neLink &middot; Demo transaction
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Balance animation floating badge ─────────────────────────────── */

function BalanceBadge({ amount }: { amount: number }) {
  return (
    <motion.div
      className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-2.5 shadow-[0_8px_24px_rgba(34,197,94,0.2)]"
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: "spring", damping: 15 }}
    >
      <motion.span
        className="text-emerald-400 font-bold text-sm"
        initial={{ scale: 1.3 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring" }}
      >
        +${amount.toFixed(2)}
      </motion.span>
      <span className="text-white/40 text-xs">added to balance</span>
    </motion.div>
  );
}

/* ── Live tip feed on the side ────────────────────────────────────── */

function DemoFeed() {
  const [tips, setTips] = useState<{ name: string; amount: string; note: string; id: number }[]>([]);

  useEffect(() => {
    let count = 0;
    const iv = setInterval(() => {
      const amt = [3, 5, 7, 10, 15, 20, 25, 50][Math.floor(Math.random() * 8)];
      setTips((prev) => {
        const next = [
          { name: NAMES[count % NAMES.length], amount: `$${amt}.00`, note: NOTES[count % NOTES.length], id: count },
          ...prev,
        ].slice(0, 5);
        count++;
        return next;
      });
    }, 2500);

    // kick first
    setTips([{ name: NAMES[0], amount: "$10.00", note: NOTES[0], id: 0 }]);
    count = 1;
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          className="w-2 h-2 rounded-full bg-emerald-400"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-xs text-white/40 font-medium">Live Tips</span>
      </div>
      <AnimatePresence initial={false}>
        {tips.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/8 px-3 py-2.5"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/40 to-cyan-400/40 flex items-center justify-center text-[11px] font-bold text-white/80 shrink-0">
              {t.name === "Anonymous" ? "?" : t.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-white/70 truncate">{t.name}</span>
                <span className="text-sm font-bold text-emerald-400">{t.amount}</span>
              </div>
              {t.note && <p className="text-xs text-white/40 truncate">{t.note}</p>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  DEMO PAGE                                                        */
/* ═══════════════════════════════════════════════════════════════════ */

export default function DemoPage() {
  const [themeIdx, setThemeIdx] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [lastAmount, setLastAmount] = useState(0);
  const [lastNote, setLastNote] = useState("");

  const theme = THEMES[themeIdx];
  const presets = [5, 10, 20];

  const chosenAmount = selectedPreset ?? (Number(customAmount) || 0);

  const handleSend = useCallback(() => {
    if (chosenAmount <= 0) return;
    setSending(true);
    setLastAmount(chosenAmount);
    setLastNote(note);

    // simulate processing
    setTimeout(() => {
      setSending(false);
      setShowSuccess(true);

      // Haptic feedback (mobile)
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([10, 50, 10]);
      }

      // Success sound
      try {
        const audio = new Audio("/sounds/success.mp3");
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch {}

      // Balance animation — show after a beat
      setTimeout(() => {
        setShowBalance(true);
        setTimeout(() => setShowBalance(false), 2500);
      }, 400);
    }, 1500);
  }, [chosenAmount, note]);

  const handleReset = useCallback(() => {
    setShowSuccess(false);
    setShowReceipt(false);
    setSelectedPreset(10);
    setCustomAmount("");
    setNote("");
  }, []);

  const handleViewReceipt = useCallback(() => {
    setShowSuccess(false);
    setShowReceipt(true);
  }, []);

  const isArmy = theme.key === "army_black";

  return (
    <div className={`min-h-screen text-white relative transition-colors duration-500 ${isArmy ? "theme-camo-animate" : ""}`}>
      {/* Background layer — separate so camo float animation works */}
      <div className={`absolute inset-0 ${theme.bg} ${isArmy ? "theme-camo-float" : ""}`} />
      {/* Wrapper overlay (dark semi-transparent for army camo) */}
      {"wrapper" in theme && theme.wrapper && (
        <div className={`absolute inset-0 ${theme.wrapper}`} />
      )}
      {/* Noise overlay for army themes */}
      {isArmy && <div className="absolute inset-0 bg-black/40 mix-blend-overlay pointer-events-none" />}
      {/* Gradient blobs (hidden on army to keep camo clean) */}
      {!isArmy && (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-[-100px] left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-blue-500/10 blur-[180px]"
          animate={{ opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[200px] -right-[100px] h-[350px] w-[350px] rounded-full bg-purple-500/8 blur-[120px]"
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      )}

      {/* Header bar */}
      <div className="relative z-10 border-b border-white/8 bg-white/[0.02] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2 text-white/60 hover:text-white/80 transition text-sm">
            <ArrowLeft size={16} />
            Back to Home
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-400" />
            <span className="text-xs text-white/40 font-medium">DEMO MODE</span>
          </div>
          <Link
            href="/signup"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 transition text-white"
          >
            Sign Up Free
          </Link>
        </div>
      </div>

      {/* Demo banner */}
      <div className="relative z-10 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-2.5 text-center">
          <p className="text-xs text-white/50">
            <span className="text-yellow-400 font-semibold">Interactive Demo</span> — Try the full tipping experience. No account needed, no real charges.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-[1fr_340px] gap-10 items-start">

          {/* LEFT: Tip page simulation */}
          <div className="max-w-md mx-auto lg:mx-0 w-full">
            {/* Profile header */}
            <div className="relative mb-8">
              <div className="h-32 w-full rounded-2xl bg-gradient-to-r from-purple-400/30 via-pink-300/25 to-amber-300/25" />
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
                <motion.div
                  className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 border-2 border-white/20 flex items-center justify-center text-white font-bold text-2xl shadow-xl"
                  whileHover={{ scale: 1.05 }}
                >
                  J
                </motion.div>
              </div>
            </div>

            <div className="text-center mt-10 mb-6">
              <h2 className="text-2xl font-bold">Jessica Kim</h2>
              <p className={`${theme.muted2} text-sm`}>@jessicaK</p>
              <p className={`${theme.muted2} text-xs mt-1`}>📍 Portland, OR</p>
              <p className={`${theme.muted} text-sm mt-2`}>Barista & latte art enthusiast ☕</p>
            </div>

            {/* Theme picker */}
            <div className="flex gap-1.5 justify-center mb-6">
              {THEMES.map((t, i) => (
                <motion.button
                  key={t.key}
                  onClick={() => setThemeIdx(i)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    i === themeIdx ? t.pill : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                  }`}
                  whileTap={{ scale: 0.93 }}
                >
                  {t.label}
                </motion.button>
              ))}
            </div>

            {/* Tip card */}
            <motion.div
              className={`rounded-2xl border p-5 ${theme.card} transition-all duration-300`}
              layout
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-sm font-medium ${theme.muted}`}>Send a tip</span>
                <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                  <span className="text-emerald-300 font-semibold text-sm">$</span>
                </div>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-3 gap-3">
                {presets.map((amt) => (
                  <motion.button
                    key={amt}
                    onClick={() => { setSelectedPreset(amt); setCustomAmount(""); }}
                    className={`rounded-xl py-3 text-sm font-semibold border transition-all ${
                      selectedPreset === amt
                        ? theme.button + " " + theme.buttonGlow
                        : `${theme.inputBg} ${theme.muted} hover:opacity-80`
                    }`}
                    whileTap={{ scale: 0.95 }}
                  >
                    ${amt}
                  </motion.button>
                ))}
              </div>

              {/* Custom toggle */}
              <motion.button
                onClick={() => { setSelectedPreset(null); }}
                className={`mt-3 w-full rounded-xl px-4 py-3 font-semibold text-sm border transition-all ${
                  selectedPreset === null
                    ? theme.button + " " + theme.buttonGlow
                    : `${theme.inputBg} ${theme.muted} hover:opacity-80`
                }`}
                whileTap={{ scale: 0.97 }}
              >
                Custom Amount
              </motion.button>

              {/* Custom input */}
              <AnimatePresence>
                {selectedPreset === null && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 flex items-center gap-2">
                      <span className={theme.muted}>$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className={`w-full rounded-xl ${theme.inputBg} px-4 py-3 outline-none text-white placeholder:text-white/30`}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Note */}
              <div className="mt-4">
                <p className={`text-sm font-medium mb-2 ${theme.muted}`}>Leave a note (optional)</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="Say something nice…"
                  rows={2}
                  className={`w-full rounded-xl ${theme.inputBg} px-4 py-3 outline-none text-white placeholder:text-white/30 resize-none`}
                />
              </div>

              {/* Fee breakdown */}
              {chosenAmount > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`mt-4 rounded-xl ${theme.inputBg} p-3 space-y-1`}
                >
                  <div className="flex justify-between text-xs">
                    <span className={theme.muted2}>Tip</span>
                    <span className={theme.muted}>${chosenAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={theme.muted2}>Processing fee</span>
                    <span className={theme.muted}>${(chosenAmount * 0.029 + 0.30).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1 flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>${(chosenAmount + chosenAmount * 0.029 + 0.30).toFixed(2)}</span>
                  </div>
                </motion.div>
              )}

              {/* Send button */}
              <motion.button
                onClick={handleSend}
                disabled={chosenAmount <= 0 || sending}
                className={`w-full mt-4 rounded-xl py-3.5 text-sm font-semibold transition-all ${
                  chosenAmount > 0
                    ? `${theme.button} ${theme.buttonGlow}`
                    : "bg-white/10 text-white/30 cursor-not-allowed"
                }`}
                whileTap={chosenAmount > 0 ? { scale: 0.97 } : undefined}
                whileHover={chosenAmount > 0 ? { scale: 1.01 } : undefined}
              >
                {sending ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.div
                      className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                    Processing…
                  </span>
                ) : (
                  `Send $${chosenAmount > 0 ? chosenAmount.toFixed(2) : "0.00"} Tip`
                )}
              </motion.button>

              {/* Security badge */}
              <div className={`mt-3 flex items-center justify-center gap-2 ${theme.muted2} text-xs`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure &middot; Powered by Stripe
              </div>
            </motion.div>

            {/* CTA below card */}
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-white/40 text-sm mb-3">Want your own tip page?</p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-white font-semibold text-sm shadow-[0_8px_24px_rgba(59,130,246,0.35)] hover:shadow-[0_12px_36px_rgba(59,130,246,0.5)] transition-all"
              >
                Create Your Free Page
                <Heart size={14} className="text-pink-300" />
              </Link>
            </motion.div>
          </div>

          {/* RIGHT: Live feed + stats */}
          <div className="hidden lg:block space-y-6">
            <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-5">
              <DemoFeed />
            </div>

            {/* Quick stats */}
            <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-5">
              <h3 className="text-sm font-semibold text-white/60 mb-4">Jessica&rsquo;s Stats</h3>
              <div className="space-y-3">
                {[
                  { label: "This Week", value: "$342.50", change: "+28%" },
                  { label: "Total Earned", value: "$4,821.00", change: "" },
                  { label: "Total Tips", value: "312", change: "" },
                  { label: "Avg Tip", value: "$15.45", change: "" },
                ].map((s) => (
                  <div key={s.label} className="flex justify-between items-center">
                    <span className="text-xs text-white/40">{s.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.value}</span>
                      {s.change && (
                        <span className="text-xs text-emerald-400 font-medium">{s.change}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features callout */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 p-5">
              <h3 className="text-sm font-semibold mb-3">What you get with 1neLink</h3>
              <ul className="space-y-2">
                {[
                  "Instant payouts to bank or card",
                  "14 premium themes",
                  "Real-time earnings dashboard",
                  "Zero monthly fees",
                  "QR code for in-person tipping",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                    <Check size={12} className="text-emerald-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Balance badge animation */}
      <AnimatePresence>
        {showBalance && <BalanceBadge amount={lastAmount} />}
      </AnimatePresence>

      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <SuccessOverlay
            amount={lastAmount}
            note={lastNote}
            onClose={handleReset}
            onViewReceipt={handleViewReceipt}
          />
        )}
      </AnimatePresence>

      {/* Receipt modal */}
      <AnimatePresence>
        {showReceipt && (
          <ReceiptModal
            amount={lastAmount}
            note={lastNote}
            onClose={handleReset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
