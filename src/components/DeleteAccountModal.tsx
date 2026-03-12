"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  email: string | null;
  onDeleted?: () => void;
};

export default function DeleteAccountModal({ open, onClose, email, onDeleted }: Props) {
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState<unknown>(null);

  const canSubmit = useMemo(() => {
    return !!email && password.length >= 6 && confirmText.trim().toUpperCase() === "DELETE";
  }, [email, password, confirmText]);

  async function onConfirmDelete() {
    setErr(null);
    setDetails(null);

    if (!email) {
      setErr("You must be signed in to delete your account.");
      return;
    }
    if (!canSubmit) return;

    setLoading(true);
    try {
      // 1) Re-authenticate (password gate)
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        setErr("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }

      // 2) Get fresh session token
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setErr("Session error. Please log in again.");
        setLoading(false);
        return;
      }

      // 3) Call hard-delete API
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();

      if (!r.ok) {
        if (r.status === 409) {
          setErr(j.error || "Account can’t be deleted yet.");
          setDetails(j.details || null);
        } else {
          setErr(j.error || "Delete failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      // 4) Signed out already? Just redirect to login
      await supabase.auth.signOut();
      onDeleted?.();
      window.location.href = "/login";
    } catch (e: unknown) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1220]/90 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-white">Delete account</div>
            <div className="mt-1 text-sm text-white/60">
              This will permanently delete your TIPLINKME profile and data.
            </div>
          </div>
          <button
            className="rounded-lg px-2 py-1 text-white/70 hover:text-white"
            onClick={loading ? undefined : onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Warning box */}
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
          <div className="text-sm font-semibold text-red-200">This cannot be undone.</div>
          <div className="mt-1 text-xs text-red-200/80">
            You can’t delete your account if you have funds available, pending funds, fees owed, or a withdrawal in progress.
          </div>
        </div>

        {/* Password */}
        <div className="mt-4">
          <label className="text-xs text-white/60">Confirm with your password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            placeholder="Enter password"
            autoComplete="current-password"
          />
        </div>

        {/* Type DELETE */}
        <div className="mt-4">
          <label className="text-xs text-white/60">
            Type <span className="font-semibold text-white">DELETE</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            placeholder="DELETE"
          />
        </div>

        {/* Errors */}
        {err && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
            <div className="font-semibold text-white">Can’t delete yet</div>
            <div className="mt-1 text-white/70">{err}</div>

            {details && (
              <div className="mt-2 text-xs text-white/55">
                Available: ${Number(details.available ?? 0).toFixed(2)} • Pending: ${Number(details.pending ?? 0).toFixed(2)} • Fees owed: ${Number(details.withdrawFee ?? 0).toFixed(2)}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button
            onClick={loading ? undefined : onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>

          <button
            onClick={onConfirmDelete}
            disabled={!canSubmit || loading}
            className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Delete account"}
          </button>
        </div>

        <div className="mt-3 text-xs text-white/40">
          TIPLINKME uses Stripe Connect for payouts. If Stripe has pending funds, deletion may be blocked until settlement.
        </div>
      </div>
    </div>
  );
}
