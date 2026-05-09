"use client";

import { useEffect, useState } from "react";
import { ui } from "@/lib/ui";
import { showGlobalToast } from "@/components/GlobalToast";
import { supabase } from "@/lib/supabase/client";

interface EmailChangeCardProps {
  currentEmail: string | null;
}

export default function EmailChangeCard({ currentEmail }: EmailChangeCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [showLockedModal, setShowLockedModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const lock = data.user?.app_metadata?.email_change_locked_until;
      setLockedUntil(typeof lock === "string" ? lock : null);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setNewEmail("");
    setPassword("");
    setShowPassword(false);
  };

  const lockEnd = lockedUntil ? new Date(lockedUntil) : null;
  const isLocked = Boolean(lockEnd && lockEnd.getTime() > Date.now());
  const lockMessage = isLocked && lockEnd
    ? `You can change your email again after ${lockEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}.`
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("Not signed in");
      }

      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newEmail, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (typeof data.lockedUntil === "string") {
          setLockedUntil(data.lockedUntil);
          setIsOpen(false);
          resetForm();
        }
        showGlobalToast({
          type: "error",
          title: "Email change failed",
          message: data.error || "Failed to change email",
        });
        return;
      }

      showGlobalToast({
        type: "success",
        title: "Email changed",
        message: data.message || `Email changed to ${newEmail}. Please verify it.`,
      });

      setLockedUntil(typeof data.lockedUntil === "string" ? data.lockedUntil : null);
      resetForm();
      setIsOpen(false);
    } catch (err) {
      showGlobalToast({
        type: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div className={`${ui.card} rounded-2xl backdrop-blur-xl border border-white/[0.12] p-5 space-y-3`}>
        <p className="text-xs font-medium uppercase tracking-wider text-white/55">Email Address</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-semibold">{currentEmail}</p>
            <p className="text-xs text-white/50 mt-1">Your account email</p>
            {lockMessage ? (
              <p className="text-xs text-amber-300 mt-2">{lockMessage}</p>
            ) : null}
          </div>
          <button
            onClick={() => {
              if (isLocked) {
                setShowLockedModal(true);
                return;
              }
              resetForm();
              setIsOpen(true);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition active:scale-[0.97]"
          >
            {isLocked ? "Locked" : "Change"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.card} rounded-2xl backdrop-blur-xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-white/55">Change Email Address</p>
        <button
          onClick={() => {
            setIsOpen(false);
            resetForm();
          }}
          className="text-white/50 hover:text-white transition"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        {/* Current Email (Read-only) */}
        <div>
          <label className="text-xs font-medium text-white/70 block mb-2">Current Email</label>
          <div className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm">
            {currentEmail}
          </div>
        </div>

        {/* New Email */}
        <div>
          <label htmlFor="newEmail" className="text-xs font-medium text-white/70 block mb-2">
            New Email Address
          </label>
          <input
            id="newEmail"
            type="email"
            name="account-new-email"
            autoComplete="off"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="your.new.email@example.com"
            required
            disabled={isLoading}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-blue-500/50 focus:bg-white/[0.07] transition disabled:opacity-50"
          />
          <p className="text-xs text-white/50 mt-1">
            You'll need to verify this email address
          </p>
        </div>

        {/* Password Verification */}
        <div>
          <label htmlFor="password" className="text-xs font-medium text-white/70 block mb-2">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              name="account-email-change-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-blue-500/50 focus:bg-white/[0.07] transition disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition disabled:opacity-50"
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <p className="text-xs text-white/50 mt-1">
            For security, confirm your password to change your email
          </p>
        </div>

        {/* Security Note */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <p className="text-xs text-emerald-400">
            🔒 Your password is encrypted and only used to verify this request. It is not stored.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isLoading || !newEmail || !password}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Changing email..." : "Change Email"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              resetForm();
            }}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {showLockedModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#0f172a] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">Email Change Locked</p>
                <h3 className="mt-2 text-xl font-semibold text-white">You&apos;re not eligible to change your email yet</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLockedModal(false)}
                className="text-white/50 hover:text-white transition"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <p className="mt-4 text-sm text-white/70">
              For account security, email changes are locked for 2 weeks after a successful update.
            </p>
            {lockMessage ? (
              <p className="mt-3 text-sm font-medium text-amber-300">{lockMessage}</p>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLockedModal(false)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 active:scale-[0.98]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
