"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders } from "@/lib/auth/adminSession";

type SupportNotification = {
  id: string;
  session_id: string;
  from_admin_id: string;
  from_admin_name: string;
  to_admin_id: string;
  type: string;
  status: string;
  metadata: { target_admin_name?: string; last_message?: string };
  created_at: string;
};

const NOTIFICATION_TIMEOUT_MS = 30_000;

export default function SupportTransferModal() {
  const router = useRouter();
  const [request, setRequest] = useState<SupportNotification | null>(null);
  const [responding, setResponding] = useState(false);
  const [result, setResult] = useState<"accepted" | "declined" | "expired" | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineCustom, setDeclineCustom] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get current admin from localStorage
  const getAdmin = useCallback(() => {
    const raw = localStorage.getItem("admin_session");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  // Auto-expire after 30s
  useEffect(() => {
    if (!request) return;
    timeoutRef.current = setTimeout(() => {
      handleDecline(true);
    }, NOTIFICATION_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [request]);

  // Poll for incoming transfer requests (realtime blocked by RLS)
  useEffect(() => {
    const admin = getAdmin();
    if (!admin?.admin_id) return;

    let active = true;
    let lastSeenId: string | null = null;

    async function poll() {
      if (!active) return;
      try {
        const res = await fetch("/api/admin/support/transfer-check", {
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const notif = data.notification;
          if (notif && notif.id !== lastSeenId) {
            lastSeenId = notif.id;
            setRequest(notif);
            setResult(null);
            try {
              audioRef.current = new Audio("/sounds/notify.wav");
              audioRef.current.volume = 0.5;
              audioRef.current.play().catch(() => {});
            } catch {}
            navigator.vibrate?.(200);
          }
        }
      } catch {}
    }

    poll();
    const interval = setInterval(poll, 5_000);
    return () => { active = false; clearInterval(interval); };
  }, [getAdmin]);

  async function handleAccept() {
    if (!request) return;
    setResponding(true);
    const admin = getAdmin();

    const res = await fetch("/api/support/notification/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin?.admin_id || "",
      },
      body: JSON.stringify({
        notificationId: request.id,
        action: "accept",
      }),
    });

    setResponding(false);

    if (res.ok) {
      const data = await res.json();
      setResult("accepted");
      // Navigate to the session after a brief confirmation
      setTimeout(() => {
        setRequest(null);
        setResult(null);
        router.push(`/admin/support/${data.sessionId}`);
      }, 1000);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to accept");
    }
  }

  async function handleDecline(isTimeout = false) {
    if (!request) return;
    setResponding(true);
    const admin = getAdmin();
    const reason = isTimeout
      ? "Request timed out"
      : declineReason === "Other"
      ? declineCustom.trim() || "Other"
      : declineReason || "No reason given";

    await fetch("/api/support/notification/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": admin?.admin_id || "",
      },
      body: JSON.stringify({
        notificationId: request.id,
        action: "decline",
        reason,
      }),
    }).catch(() => {});

    setResponding(false);
    setResult(isTimeout ? "expired" : "declined");
    setTimeout(() => {
      setRequest(null);
      setResult(null);
      setShowDeclineForm(false);
      setDeclineReason("");
      setDeclineCustom("");
    }, 1500);
  }

  if (!request) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s_ease]">
      <div className="bg-black border border-white/10 rounded-2xl p-5 w-[340px] text-white shadow-2xl animate-[slideIn_0.3s_ease]">
        {/* Pulse ring */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-lg">
              ↔️
            </div>
            <div className="absolute inset-0 w-10 h-10 rounded-full bg-blue-500/30 animate-ping" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Transfer Request</h2>
            <p className="text-xs text-white/40">Incoming support handoff</p>
          </div>
        </div>

        <p className="text-sm text-white/70 mb-3">
          <span className="text-blue-400 font-medium">{request.from_admin_name}</span>{" "}
          is requesting you to take over a chat.
        </p>

        {/* Last message preview */}
        {request.metadata?.last_message && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Last message</p>
            <p className="text-xs text-white/60 line-clamp-2">
              {request.metadata.last_message}
            </p>
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div className={`text-center py-3 mb-2 rounded-xl text-sm font-medium ${
            result === "accepted"
              ? "bg-emerald-500/10 text-emerald-400"
              : result === "expired"
              ? "bg-yellow-500/10 text-yellow-400"
              : "bg-red-500/10 text-red-400"
          }`}>
            {result === "accepted" && "✓ Accepted — opening chat…"}
            {result === "declined" && "✗ Declined"}
            {result === "expired" && "⏰ Expired — request timed out"}
          </div>
        )}

        {/* Action buttons */}
        {!result && !showDeclineForm && (
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              disabled={responding}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black py-2.5 rounded-xl text-sm font-semibold transition active:scale-95"
            >
              {responding ? "…" : "Accept"}
            </button>
            <button
              onClick={() => setShowDeclineForm(true)}
              disabled={responding}
              className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition active:scale-95"
            >
              Decline
            </button>
          </div>
        )}

        {/* Decline reason form */}
        {!result && showDeclineForm && (
          <div className="space-y-2 animate-[fadeIn_0.2s_ease]">
            <p className="text-xs text-white/50 font-medium">Why are you declining?</p>
            <div className="flex flex-wrap gap-1.5">
              {["Busy right now", "Not my area", "Other"].map((r) => (
                <button
                  key={r}
                  onClick={() => setDeclineReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition active:scale-95 ${
                    declineReason === r
                      ? "bg-red-500/15 border-red-500/30 text-red-400"
                      : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {declineReason === "Other" && (
              <input
                value={declineCustom}
                onChange={(e) => setDeclineCustom(e.target.value)}
                placeholder="Brief reason…"
                maxLength={120}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition"
                autoFocus
              />
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleDecline(false)}
                disabled={responding || !declineReason}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-40 text-red-400 py-2 rounded-xl text-sm font-medium transition active:scale-95"
              >
                {responding ? "…" : "Submit & Decline"}
              </button>
              <button
                onClick={() => { setShowDeclineForm(false); setDeclineReason(""); setDeclineCustom(""); }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/50 rounded-xl text-sm transition"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Timeout indicator */}
        {!result && !showDeclineForm && (
          <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500/40 rounded-full"
              style={{
                animation: `shrink ${NOTIFICATION_TIMEOUT_MS}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
