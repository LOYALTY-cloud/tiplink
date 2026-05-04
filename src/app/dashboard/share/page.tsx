"use client";

import React, { useEffect, useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

export default function SharePage() {
  const [handle, setHandle] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState<string>("");
  const [pulse, setPulse] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [suggested, setSuggested] = useState<number[]>([5, 10, 20]);
  const [liveTip, setLiveTip] = useState<null | { amount: number; sender: string }>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;

      setUserId(user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle")
        .eq("user_id", user.id)
        .maybeSingle();

      setHandle(prof?.handle ?? null);
    })();
  }, []);

  // Smart suggested amounts from recent transactions
  useEffect(() => {
    if (!handle) return;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("transactions_ledger")
        .select("amount")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!data || data.length === 0) return;

      const amounts = data
        .map((t) => Math.round(Number(t.amount)))
        .filter((n) => n > 0);

      const unique = [...new Set(amounts)].slice(0, 3);
      if (unique.length) setSuggested(unique);
    })();
  }, [handle]);

  // QR glow pulse on amount change
  useEffect(() => {
    if (amount !== null) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(t);
    }
  }, [amount]);

  // Live tip detection — listen for incoming payments while QR is open
  useEffect(() => {
    if (!fullscreen || !handle || !userId) return;

    const channel = supabase
      .channel("live-tips")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions_ledger",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const tx = payload.new as Record<string, unknown>;
          if (tx?.amount && Number(tx.amount) > 0) {
            setLiveTip({
              amount: Number(tx.amount),
              sender: (tx.sender_name as string) || "Someone",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fullscreen, handle, userId]);

  // Success animation → then receipt
  useEffect(() => {
    if (!liveTip) return;
    setShowSuccess(true);

    const t = setTimeout(() => {
      setShowSuccess(false);
      setShowReceipt(true);
    }, 2500);

    return () => clearTimeout(t);
  }, [liveTip]);

  // Auto-dismiss receipt
  useEffect(() => {
    if (!showReceipt) return;
    const t = setTimeout(() => {
      setShowReceipt(false);
      setLiveTip(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [showReceipt]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://1nelink.app";
  const username = handle ?? "yourname";
  const basePath = `${origin}/@${username}`;
  const shareUrl = amount ? `${basePath}?amount=${amount}` : basePath;

  const copyLink = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    }
    alert("Copied!");
  };

  const handlePreset = (val: number | null) => {
    setAmount(val);
    setCustom("");
  };

  const handleCustomChange = (v: string) => {
    setCustom(v);
    const n = Number(v);
    if (!v) return setAmount(null);
    if (!Number.isNaN(n) && n > 0) setAmount(Math.round(n));
    else setAmount(null);
  };

  const downloadPNG = () => {
    if (!previewRef.current) return;
    const canvas = previewRef.current.querySelector("canvas");
    if (!canvas) return;
    const url = (canvas as HTMLCanvasElement).toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${username}-tip.png`;
    a.click();
  };

  const shareQR = async () => {
      try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: `Tip ${username}`, text: `Send a tip to ${username}`, url: shareUrl });
        return;
      }
    } catch (e) {
      // fallthrough to copy
    }

    // Desktop fallback: copy link and download PNG as convenience
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      alert("Link copied to clipboard");
    } catch {
      alert("Could not copy link. Try manually: " + shareUrl);
    }
    downloadPNG();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className={`${ui.card} p-6`}>
        <h1 className="text-xl font-semibold text-white">Share your link</h1>
        <p className="text-sm text-white/50 mt-1">
          Set an amount, generate a QR, and get paid instantly.
        </p>
        <div className="mt-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-4 py-2.5">
          <span className="text-emerald-400 text-lg">📲</span>
          <span className="text-sm text-emerald-300">Show this QR to anyone to receive tips — no app needed</span>
        </div>
      </div>

      {/* Main Card */}
      <div className={`${ui.card} p-6 space-y-5`}>

        {/* Amount Selector */}
        <div>
          <div className="text-sm text-white/80 mb-2 font-medium">
            Preset amount
          </div>

          <div className="flex flex-wrap gap-2">
            {suggested.map((v) => (
              <button
                key={v}
                onClick={() => handlePreset(v)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-all duration-200
                  ${amount === v
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
              >
                ${v}
              </button>
            ))}

            <input
              type="number"
              placeholder="Custom"
              value={custom}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="w-28 rounded-lg bg-white/5 border border-white/[0.12] px-3 py-1.5 text-sm text-white placeholder:text-white/45 focus:outline-none focus:border-blue-400 transition"
            />
          </div>
        </div>

        {/* QR Preview */}
        <div className={`${ui.cardInner} p-6 text-center`}>
          <div
            ref={previewRef}
            id="qr-preview"
            onClick={() => setFullscreen(true)}
            className={`inline-block p-5 bg-white rounded-xl shadow-2xl cursor-pointer transition-all duration-300 hover:scale-[1.03] ${
              pulse ? "scale-110 shadow-blue-500/40" : "scale-100"
            }`}
          >
            <div className="relative inline-block">
              <QRCodeCanvas value={shareUrl} size={220} includeMargin={true} />
              <img
                src="/1nelink-icon.png"
                alt="logo"
                className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1 shadow-md"
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-white/80">
            {amount ? `Scan to send $${amount}` : `Scan to send`}
          </div>
          <div className="mt-1 text-xs text-white/45">Tap QR to present fullscreen</div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={shareQR}
            className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-600 transition text-white font-medium py-2.5 shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            {amount ? `Share $${amount}` : `Share QR`}
          </button>

          <button
            onClick={copyLink}
            className="px-4 rounded-xl bg-white/5 hover:bg-white/10 transition text-white/80 text-sm"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Fullscreen QR modal */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6"
          onClick={() => setFullscreen(false)}
        >
          {/* Live tip banner */}
          {liveTip && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-emerald-500/10 border border-emerald-400/20 px-4 py-2 rounded-full text-sm text-emerald-300 animate-bounce">
              +${liveTip.amount} received
            </div>
          )}

          <div className="text-white text-sm mb-4 opacity-50">
            Tap anywhere to close
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-2xl relative">
            <QRCodeCanvas value={shareUrl} size={300} includeMargin={true} />
            <img
              src="/1nelink-icon.png"
              alt="logo"
              className="absolute top-1/2 left-1/2 w-12 h-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1 shadow-md"
            />
          </div>

          <div className="mt-5 text-white text-lg font-semibold">
            {amount ? `$${amount}` : "Scan to tip"}
          </div>
          <div className="mt-1 text-white/55 text-sm">@{username} &middot; 1neLink</div>
        </div>
      )}

      {/* Success animation overlay */}
      {showSuccess && liveTip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="text-center animate-pulse">
            <div className="w-28 h-28 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.6)]">
              <span className="text-4xl">💸</span>
            </div>
            <div className="mt-4 text-white text-xl font-semibold">
              +${liveTip.amount}
            </div>
            <div className="text-white/60 text-sm">
              {liveTip.sender} sent a tip
            </div>
          </div>
        </div>
      )}

      {/* Receipt pop */}
      {showReceipt && liveTip && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-sm">
          <div className="bg-[#0b0f1a] border border-white/[0.12] rounded-xl p-4 shadow-xl animate-[slideUp_0.3s_ease]">
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-xs">Payment received</span>
              <span className="text-emerald-400 text-sm font-semibold">+${liveTip.amount}</span>
            </div>
            <div className="mt-2 text-sm text-white">From {liveTip.sender}</div>
            <div className="mt-1 text-xs text-white/55">{new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
