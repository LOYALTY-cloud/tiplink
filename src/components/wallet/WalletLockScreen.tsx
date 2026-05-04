"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { startAuthentication } from "@simplewebauthn/browser";

interface Props {
  maskedEmail: string;
  onUnlock: () => void;
  onSuggestBiometric?: () => void;
}

export default function WalletLockScreen({ maskedEmail, onUnlock, onSuggestBiometric }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [forcedOut, setForcedOut] = useState(false);
  const [remaining, setRemaining] = useState(3);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  // Premium unlock animation states
  const [unlockPhase, setUnlockPhase] = useState<"locked" | "verified" | "exiting">("locked");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function forceLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  /** Premium 3-step unlock: verified → glow → fade out */
  function triggerUnlock(opts?: { suggestBiometric?: boolean }) {
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    setUnlockPhase("verified");

    setTimeout(() => {
      setUnlockPhase("exiting");
      if (navigator.vibrate) navigator.vibrate(10);

      setTimeout(() => {
        onUnlock();
        if (opts?.suggestBiometric && onSuggestBiometric) onSuggestBiometric();
      }, 400);
    }, 650);
  }

  // ── Check DB for biometric credentials + attempt server-verified biometric on mount ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (typeof window === "undefined" || !window.PublicKeyCredential) {
        inputRefs.current[0]?.focus();
        return;
      }

      const token = await getToken();
      if (!token) { inputRefs.current[0]?.focus(); return; }

      // Check if user has registered biometric in DB
      try {
        const res = await fetch("/api/wallet/biometric", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { inputRefs.current[0]?.focus(); return; }
        const json = await res.json();

        if (!json.registered || !json.credentialIds?.length) {
          if (!cancelled) inputRefs.current[0]?.focus();
          return;
        }

        if (cancelled) return;
        setBiometricAvailable(true);
        setBiometricChecking(true);

        // Request server-generated challenge
        const challengeRes = await fetch("/api/wallet/biometric/challenge", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!challengeRes.ok) { if (!cancelled) { setBiometricChecking(false); inputRefs.current[0]?.focus(); } return; }
        const options = await challengeRes.json();

        // Prompt user for biometric via browser API
        const assertion = await startAuthentication({ optionsJSON: options });

        if (cancelled) return;

        // Send assertion to server for cryptographic verification
        const verifyRes = await fetch("/api/wallet/biometric/verify", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(assertion),
        });

        if (verifyRes.ok && !cancelled) {
          triggerUnlock();
        } else if (!cancelled) {
          setBiometricChecking(false);
          inputRefs.current[0]?.focus();
        }
      } catch {
        // Biometric dismissed/failed — fall through to code
        if (!cancelled) {
          setBiometricChecking(false);
          inputRefs.current[0]?.focus();
        }
      }
    }

    init();
    return () => { cancelled = true; };
     
  }, []);

  // Auto-focus first input when biometric finishes
  useEffect(() => {
    if (!biometricChecking) inputRefs.current[0]?.focus();
  }, [biometricChecking]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, "").slice(-1);
      setError("");
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    },
    []
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }, []);

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (digits.every((d) => d) && !verifying && !forcedOut) {
      verify(digits.join(""));
    }
     
  }, [digits]);

  async function verify(code: string) {
    setVerifying(true);
    setError("");

    try {
      const token = await getToken();
      if (!token) {
        setError("Session expired. Please log in again.");
        setVerifying(false);
        return;
      }

      const res = await fetch("/api/wallet/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        // Check if we should suggest biometric after unlock
        let shouldSuggestBiometric = false;
        if (onSuggestBiometric && window.PublicKeyCredential && !biometricAvailable) {
          try {
            const canUse = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (canUse) shouldSuggestBiometric = true;
          } catch { /* proceed */ }
        }

        triggerUnlock({ suggestBiometric: shouldSuggestBiometric });
      } else if (json.forceLogout) {
        // Server forced logout
        setForcedOut(true);
        setRemaining(0);
        setError("Too many failed attempts. Signing out…");
        setTimeout(() => forceLogout(), 1500);
      } else {
        setError(json.error || "Incorrect code");
        if (typeof json.remaining === "number") setRemaining(json.remaining);
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Something went wrong");
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  // ── Biometric retry (manual button) — server-verified ──
  async function handleBiometricRetry() {
    setBiometricChecking(true);
    try {
      const token = await getToken();
      if (!token) { setBiometricChecking(false); return; }

      // Request fresh challenge from server
      const challengeRes = await fetch("/api/wallet/biometric/challenge", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!challengeRes.ok) { setBiometricChecking(false); return; }
      const options = await challengeRes.json();

      // Prompt browser biometric
      const assertion = await startAuthentication({ optionsJSON: options });

      // Verify on server
      const verifyRes = await fetch("/api/wallet/biometric/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      });

      if (verifyRes.ok) {
        triggerUnlock();
      } else {
        setBiometricChecking(false);
      }
    } catch {
      setBiometricChecking(false);
    }
  }

  async function resendCode() {
    setResending(true);
    setError("");
    setResent(false);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/wallet/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setRemaining(3); // Reset frontend display — server already resets attempts on new code
        setResent(true);
        setTimeout(() => setResent(false), 3000);
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Failed to resend code");
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setResending(false);
    }
  }

  // ── Main lock screen ──
  return (
    <div className={`fixed inset-0 flex items-center justify-center z-[100] transition-all duration-400 ${
      unlockPhase === "exiting"
        ? "bg-black/0 backdrop-blur-0 unlock-overlay-exit"
        : "bg-black/80 backdrop-blur-xl"
    }`}>
      <div className={`bg-black border border-white/[0.12] rounded-2xl p-6 w-[340px] text-center space-y-4 transition-all duration-400 ${
        unlockPhase === "verified" ? "unlock-card-verified" : ""
      }${unlockPhase === "exiting" ? " unlock-card-exit" : ""}`}>

        {/* Lock → Verified icon */}
        <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center transition-all duration-500 ${
          unlockPhase === "verified"
            ? "bg-emerald-500/20 border-2 border-emerald-400/40 unlock-icon-glow scale-110"
            : "bg-emerald-500/10 border border-emerald-400/20"
        }`}>
          {unlockPhase === "verified" ? (
            <svg className="w-7 h-7 text-emerald-400 unlock-check-pop" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              className={`w-7 h-7 text-emerald-400 transition-opacity ${verifying ? "opacity-40" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
        </div>

        {/* Title — switches to "Verified" on success */}
        {unlockPhase === "verified" ? (
          <div className="unlock-text-enter">
            <h2 className="text-lg font-semibold text-emerald-400">Verified</h2>
          </div>
        ) : (
          <div className={`transition-opacity ${verifying ? "opacity-50" : ""}`}>
            <h2 className="text-lg font-semibold text-white">Wallet Locked</h2>
            <p className="text-sm text-white/50 mt-1">
              Enter the 6-digit code sent to
            </p>
            {maskedEmail && (
              <p className="text-sm text-emerald-400 font-medium mt-0.5">
                {maskedEmail}
              </p>
            )}
          </div>
        )}

        {/* Body content — hidden during verified/exiting */}
        {unlockPhase === "locked" && (
          <>
            {/* 6-digit code input */}
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={verifying || forcedOut}
                  className={`w-11 h-13 bg-white/5 border border-white/[0.12] rounded-xl text-center text-xl font-semibold text-white
                    focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/30 outline-none
                    disabled:opacity-50 transition ${verifying ? "opacity-40" : ""}`}
                />
              ))}
            </div>

            {/* Attempt dots (server-driven) */}
            {remaining < 3 && !forcedOut && (
              <div className="flex justify-center gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i >= remaining ? "bg-red-400" : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            {/* Verifying spinner */}
            {verifying && (
              <div className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-xs text-white/55">Verifying…</p>
              </div>
            )}

            {/* Biometric button */}
            {biometricAvailable && !forcedOut && (
              <button
                onClick={handleBiometricRetry}
                disabled={biometricChecking}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 border border-white/[0.12]
                  text-sm text-white/70 hover:text-white hover:bg-white/10 transition disabled:opacity-40"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.342M11.25 0v.001M7.5 10.5a4.5 4.5 0 119 0c0 3.073-.574 6.017-1.622 8.726M12 10.5a1.5 1.5 0 10-3 0c0 3.378-.622 6.616-1.757 9.6" />
                </svg>
                {biometricChecking ? "Checking…" : "Use biometrics"}
              </button>
            )}

            {/* Resend */}
            {!forcedOut && (
              <button
                onClick={resendCode}
                disabled={resending || resent}
                className="text-xs text-white/50 hover:text-white/80 transition disabled:opacity-40"
              >
                {resent ? "Code sent ✓" : resending ? "Sending…" : "Resend code"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
