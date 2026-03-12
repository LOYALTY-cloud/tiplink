"use client";

import { useEffect, useState } from "react";
import { ui } from "@/lib/ui";
import { supabase } from "@/lib/supabase/client";
import DeleteAccountModal from "@/components/DeleteAccountModal";

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      if (!mounted) return;
      setEmail(user.email ?? null);

      // load profile to check stripe_account_id
      const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
      setStripeConnected(Boolean(profile?.stripe_account_id));
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  
    const sendPasswordReset = async () => {
      try {
        setErr(null);
        setMsg(null);
        setLoading(true);

        const { data, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const email = data.user?.email;
        if (!email) {
          setErr("You must be signed in.");
          return;
        }

        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/reset-password`
            : undefined;

        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;

        setMsg("Password reset link sent. Check your email.");
      } catch (e: unknown) {
        setErr(e?.message ?? "Failed to send reset email.");
      } finally {
        setLoading(false);
      }
    };

  async function startConnect() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/stripe/connect/start", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
      else alert(body.error || "Unable to start Stripe connect");
    } catch (e: unknown) {
      alert(e?.message || "Stripe connect failed");
    } finally {
      setLoading(false);
    }
  }

  async function manageConnect() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
      else alert(body.error || "Unable to manage Stripe connect");
    } catch (e: unknown) {
      alert(e?.message || "Stripe connect failed");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (!confirm("Permanently delete your profile? This cannot be undone.")) return;
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getSession();
      const token = userRes.session?.access_token;
      if (!token) {
        alert("Not signed in.");
        return;
      }

      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          if (j.details) {
            const { available, pending, withdrawFee } = j.details;
            alert(
              `Withdraw your balance first\nAvailable: $${Number(available).toFixed(2)}\nPending: $${Number(pending).toFixed(2)}\nFees: $${Number(
                withdrawFee
              ).toFixed(2)}`
            );
          } else {
            alert(j.error || "Withdraw your balance first.");
          }
          return;
        }

        alert(j.error || "Delete failed.");
        return;
      }

      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (e: unknown) {
      alert(e?.message || "Unable to delete account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={`${ui.card} p-6`}>
      <div className={ui.h2}>Settings</div>
      <div className={ui.muted}>Manage your account and payouts.</div>

      {/* ACCOUNT */}
      <div className="mt-6">
        <div className="text-sm font-semibold text-white/85">Account</div>

        <div className={`${ui.cardInner} mt-3 p-4`}>
          <div className="text-xs text-white/50">Signed in as</div>
          <div className="mt-1 text-sm font-semibold text-white/90">{email}</div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={sendPasswordReset}
              disabled={loading}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Sending..." : "Change password"}
            </button>

            <button onClick={() => supabase.auth.signOut()} className={ui.btnGhost} disabled={loading}>
              Log out
            </button>
          </div>

          <div className="mt-3 text-xs text-white/45">Password changes are handled securely via email.</div>

          {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}
          {err && <div className="mt-3 text-sm text-red-300">{err}</div>}
        </div>
      </div>

      {/* PAYOUTS */}
      <div className="mt-8">
        <div className="text-sm font-semibold text-white/85">Payouts</div>

        <div className={`${ui.cardInner} mt-3 p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">Stripe Connect</div>
              <div className="mt-1 text-sm text-white/55">Required to receive tips and withdraw to bank.</div>
            </div>

            <span
              className={`${ui.chip} ${
                stripeConnected ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-200" : "bg-white/5 border-white/10 text-white/70"
              }`}
            >
              {stripeConnected ? "Connected" : "Not connected"}
            </span>
          </div>

          <div className="mt-4">
            {!stripeConnected ? (
              <button onClick={startConnect} className="rounded-xl px-5 py-3 font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition" disabled={loading}>
                Activate payouts
              </button>
            ) : (
              <button onClick={manageConnect} className={ui.btnPrimary} disabled={loading}>
                Manage payouts
              </button>
            )}
          </div>

          <div className="mt-3 text-xs text-white/45">
            Stripe may request identity verification to comply with banking laws. TIPLINKME does not store SSN or ID documents.
          </div>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="mt-8">
        <div className="text-sm font-semibold text-white/85">Danger zone</div>

        <div className={`${ui.cardInner} mt-3 p-4 border border-red-500/20`}>
          <div className="text-sm font-semibold text-white/90">Delete account</div>
          <div className="mt-1 text-sm text-white/55">Permanently deletes your account and profile.</div>

          <button
            onClick={() => setDeleteOpen(true)}
            className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 transition"
            disabled={loading}
          >
            Delete account
          </button>
        </div>
      </div>
      </div>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} email={email} onDeleted={() => setDeleteOpen(false)} />
    </>
  );
}
