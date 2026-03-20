"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProfileRow } from "@/types/db";
import { useToast } from "@/lib/useToast";
import DeleteAccountModal from "@/components/DeleteAccountModal";

/* ── helpers ───────────────────────────────────────────── */
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

/* ── Toggle ────────────────────────────────────────────── */
function Toggle({
  label,
  settingKey,
  value,
  onToggle,
  disabled,
  saved,
}: {
  label: string;
  settingKey: string;
  value: boolean;
  onToggle: (key: string, val: boolean) => void;
  disabled?: boolean;
  saved?: string | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm">{label}</span>
        {saved === settingKey && (
          <span className="text-xs text-emerald-400 animate-pulse">Saved</span>
        )}
      </div>
      <button
        disabled={disabled}
        onClick={() => onToggle(settingKey, !value)}
        className={`w-10 h-6 rounded-full transition disabled:opacity-50 ${
          value ? "bg-green-500" : "bg-white/10"
        }`}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full transition transform ${
            value ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/* ── Profile edit modal ────────────────────────────────── */
function ProfileEditModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  initial: { handle: string; display_name: string; bio: string };
  onClose: () => void;
  onSaved: (updated: { handle: string; display_name: string; bio: string }) => void;
}) {
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [bio, setBio] = useState(initial.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHandle(initial.handle);
      setDisplayName(initial.display_name);
      setBio(initial.bio);
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          handle: handle.trim().toLowerCase(),
          display_name: displayName.trim(),
          bio: bio.trim(),
        }),
      });
      onSaved({
        handle: handle.trim().toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim(),
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl bg-[#0A1128] border border-white/10 p-5 space-y-4">
        <p className="text-sm font-medium">Edit profile</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">Handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={30}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition resize-none"
            />
            <p className="text-xs text-white/30 text-right">{bio.length}/160</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 glass-btn-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Settings page ─────────────────────────────────────── */
export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);

  // Notification settings
  const [notifyTips, setNotifyTips] = useState(true);
  const [notifyPayouts, setNotifyPayouts] = useState(true);
  const [notifySecurity, setNotifySecurity] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [pageReady, setPageReady] = useState(false);

  const { toast, show: showToast } = useToast();

  /* ── load user data + settings ──────────────────────── */
  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user || !mounted) return;
      setEmail(user.email ?? null);

      // Format last sign-in
      if (user.last_sign_in_at) {
        const d = new Date(user.last_sign_in_at);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const time = d.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
        setLastLogin(
          isToday
            ? `Today, ${time}`
            : d.toLocaleDateString([], { month: "short", day: "numeric" }) +
                `, ${time}`
        );
      }

      // Load profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_account_id, handle, display_name, bio")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();

      if (!mounted) return;
      setStripeConnected(Boolean(profile?.stripe_account_id));
      setHandle(profile?.handle ?? null);
      setDisplayName(profile?.display_name ?? null);
      setBio(profile?.bio ?? null);

      // Load notification settings
      try {
        const settings = await apiFetch("/api/settings/notifications");
        if (!mounted) return;
        setNotifyTips(settings.notify_tips ?? true);
        setNotifyPayouts(settings.notify_payouts ?? true);
        setNotifySecurity(settings.notify_security ?? true);
      } catch {
        // defaults already set
      }

      if (mounted) setPageReady(true);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  /* ── notification toggle handler ────────────────────── */
  const handleToggle = useCallback(
    async (key: string, value: boolean) => {
      // Optimistic UI update
      const setters: Record<string, (v: boolean) => void> = {
        notify_tips: setNotifyTips,
        notify_payouts: setNotifyPayouts,
        notify_security: setNotifySecurity,
      };
      setters[key]?.(value);
      setToggleLoading(true);
      setSavedKey(null);

      try {
        await apiFetch("/api/settings/notifications", {
          method: "POST",
          body: JSON.stringify({ key, value }),
        });
        setSavedKey(key);
        setTimeout(() => setSavedKey(null), 1500);
      } catch {
        // Revert on failure
        setters[key]?.(!value);
        showToast("Failed to save", "error");
      } finally {
        setToggleLoading(false);
      }
    },
    [showToast]
  );

  /* ── password reset ─────────────────────────────────── */
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

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;

      setMsg("Password reset link sent. Check your email.");
    } catch (e: unknown) {
      setErr(
        e instanceof Error
          ? e.message
          : String(e ?? "Failed to send reset email.")
      );
    } finally {
      setLoading(false);
    }
  };

  /* ── sign out all devices ───────────────────────────── */
  const signOutAll = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/settings/sign-out-all", { method: "POST" });
      showToast("All sessions revoked", "success");
      // Sign out locally too
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Loading skeleton ──────────────────────────── */}
      {!pageReady && (
        <div className="max-w-xl mx-auto space-y-6 pb-10 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3"
            >
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="h-4 w-40 bg-white/10 rounded" />
              <div className="h-9 w-full bg-white/10 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {pageReady && (
      <div className="max-w-xl mx-auto space-y-6 pb-10">
        {/* ── ACCOUNT ─────────────────────────────────── */}
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-3">
          <p className="text-sm text-white/50">Account</p>
          <p className="text-sm font-medium text-white/90">{email ?? "—"}</p>

          <div className="flex gap-2">
            <button
              onClick={sendPasswordReset}
              disabled={loading}
              className="flex-1 glass-btn-sm"
            >
              {loading ? "Sending…" : "Change password"}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              disabled={loading}
              className="flex-1 glass-btn-sm"
            >
              Log out
            </button>
          </div>

          {msg && <p className="text-sm text-emerald-400">{msg}</p>}
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>

        {/* ── SECURITY ────────────────────────────────── */}
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-3">
          <p className="text-sm text-white/50">Security</p>

          <div className="flex justify-between items-center">
            <span className="text-sm">Last login</span>
            <span className="text-xs text-white/50">{lastLogin ?? "—"}</span>
          </div>

          <button
            onClick={signOutAll}
            disabled={loading}
            className="glass-btn-sm w-full"
          >
            Sign out of all devices
          </button>
        </div>

        {/* ── NOTIFICATIONS ───────────────────────────── */}
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-4">
          <p className="text-sm text-white/50">Notifications</p>

          <Toggle
            label="New tips"
            settingKey="notify_tips"
            value={notifyTips}
            onToggle={handleToggle}
            disabled={toggleLoading}
            saved={savedKey}
          />
          <Toggle
            label="Payout updates"
            settingKey="notify_payouts"
            value={notifyPayouts}
            onToggle={handleToggle}
            disabled={toggleLoading}
            saved={savedKey}
          />
          <Toggle
            label="Security alerts"
            settingKey="notify_security"
            value={notifySecurity}
            onToggle={handleToggle}
            disabled={toggleLoading}
            saved={savedKey}
          />
        </div>

        {/* ── PROFILE ─────────────────────────────────── */}
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-3">
          <p className="text-sm text-white/50">Profile</p>

          <div>
            <p className="text-xs text-white/50">Handle</p>
            <p className="text-sm font-medium text-white/90">
              {handle ? `@${handle}` : "—"}
            </p>
          </div>

          <button
            onClick={() => setProfileEditOpen(true)}
            className="glass-btn-sm w-full"
          >
            Edit profile
          </button>
        </div>

        {/* ── PAYOUTS ─────────────────────────────────── */}
        <div
          id="payouts"
          className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/50">Payouts</p>
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${
                stripeConnected
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-amber-400 bg-amber-500/10"
              }`}
            >
              {stripeConnected ? "Active" : "Not connected"}
            </span>
          </div>

          <p className="text-sm font-medium text-white/90">
            {stripeConnected
              ? "You're set to receive payouts"
              : "Connect to start receiving tips and withdraw funds"}
          </p>

          <div className="flex gap-2">
            {!stripeConnected ? (
              <button
                onClick={() =>
                  (window.location.href = "/dashboard/onboarding")
                }
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-50"
              >
                Activate payouts
              </button>
            ) : (
              <>
                <button
                  onClick={() =>
                    (window.location.href = "/dashboard/wallet")
                  }
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  Withdraw
                </button>
                <button
                  onClick={() =>
                    (window.location.href =
                      "/dashboard/onboarding?manage=1")
                  }
                  disabled={loading}
                  className="flex-1 glass-btn-sm"
                >
                  Settings
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-white/35">
            Identity verification handled securely by Stripe. We never store
            SSN or ID documents.
          </p>
        </div>

        {/* ── FEES ────────────────────────────────────── */}
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 space-y-2">
          <p className="text-sm text-white/50">Fees</p>

          <div className="flex justify-between text-sm">
            <span>Platform fee</span>
            <span>5%</span>
          </div>

          <div className="flex justify-between text-sm">
            <span>Instant payout</span>
            <span>1.5%</span>
          </div>
        </div>

        {/* ── DANGER ZONE ─────────────────────────────── */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
          <p className="text-sm text-red-400 font-medium">Danger zone</p>
          <p className="text-sm text-white/60">
            Permanently delete your account and all data.
          </p>

          <button
            onClick={() => setDeleteOpen(true)}
            disabled={loading}
            className="bg-red-600/80 hover:bg-red-600 text-sm font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            Delete account
          </button>
        </div>
      </div>
      )}

      {/* ── Toast ──────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-opacity ${
            toast.type === "success"
              ? "bg-emerald-600"
              : toast.type === "error"
                ? "bg-red-600"
                : "bg-white/10 border border-white/10"
          }`}
        >
          {toast.message}
        </div>
      )}

      <ProfileEditModal
        open={profileEditOpen}
        onClose={() => setProfileEditOpen(false)}
        initial={{
          handle: handle ?? "",
          display_name: displayName ?? "",
          bio: bio ?? "",
        }}
        onSaved={(updated) => {
          setHandle(updated.handle);
          setDisplayName(updated.display_name);
          setBio(updated.bio);
          showToast("Profile updated", "success");
        }}
      />

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        email={email}
        onDeleted={() => setDeleteOpen(false)}
      />
    </>
  );
}
