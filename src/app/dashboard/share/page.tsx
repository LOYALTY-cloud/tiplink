"use client";

import React, { useEffect, useState, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

export default function SharePage() {
  const [handle, setHandle] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState<string>("");

  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle")
        .eq("user_id", user.id)
        .maybeSingle();

      setHandle(prof?.handle ?? null);
    })();
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://tiplink.app";
  const username = handle ?? "yourname";
  const basePath = `${origin}/@${username}`;
  const shareUrl = amount ? `${basePath}?amount=${amount}` : basePath;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
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
      if ((navigator as unknown).share) {
        await (navigator as unknown).share({ title: `Tip ${username}`, text: `Send a tip to ${username}`, url: shareUrl });
        return;
      }
    } catch (e) {
      // fallthrough to copy
    }

    // Desktop fallback: copy link and download PNG as convenience
    await navigator.clipboard.writeText(shareUrl);
    alert("Link copied to clipboard");
    downloadPNG();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className={`${ui.card} p-6`}>
        <h1 className={ui.h2}>Share your link</h1>
        <p className={ui.muted}>Create a preset amount, preview the QR, and share.</p>
      </div>

      <div className={`${ui.card} p-6 space-y-4`}>
        <div>
          <div className="text-sm text-white mb-2">Preset amount</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handlePreset(5)} className={`${ui.btnGhost} ${ui.btnSmall}`}>$5</button>
            <button onClick={() => handlePreset(10)} className={`${ui.btnGhost} ${ui.btnSmall}`}>$10</button>
            <button onClick={() => handlePreset(20)} className={`${ui.btnGhost} ${ui.btnSmall}`}>$20</button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Custom"
                value={custom}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="w-28 rounded-md border px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        <div className={`${ui.cardInner} p-6 text-center`}>
          <div ref={previewRef} id="qr-preview" className="inline-block p-4 bg-white rounded-md shadow-lg">
            <QRCodeCanvas value={shareUrl} size={220} includeMargin={true} />
          </div>
          <div className="mt-3 text-sm text-white/80">{amount ? `Scan to send $${amount}` : `Scan to send`}</div>
        </div>

        <div className="flex gap-2">
          <button onClick={shareQR} className={`${ui.btnPrimary} w-full`}>
            {amount ? `Share $${amount} QR` : `Share QR Code`}
          </button>
          <button onClick={copyLink} className={`${ui.btnGhost} ${ui.btnSmall}`}>Copy link</button>
        </div>
      </div>
    </div>
  );
}
