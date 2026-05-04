"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { ProfileRow } from "@/types/db";
import { useToast } from "@/lib/useToast";
import DeleteAccountModal from "@/components/DeleteAccountModal";

/* ── helpers ───────────────────────────────────────────── */

type SessionEntry = {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

function parseDevice(ua: string | null): { device: string; browser: string; icon: string } {
  if (!ua) return { device: "Unknown", browser: "", icon: "🖥️" };
  const s = ua.toLowerCase();

  let device = "Desktop";
  let icon = "🖥️";
  if (/iphone/.test(s)) { device = "iPhone"; icon = "📱"; }
  else if (/ipad/.test(s)) { device = "iPad"; icon = "📱"; }
  else if (/android/.test(s)) { device = "Android"; icon = "📱"; }
  else if (/macintosh|mac os/.test(s)) { device = "Mac"; icon = "💻"; }
  else if (/windows/.test(s)) { device = "Windows"; icon = "🖥️"; }
  else if (/linux/.test(s)) { device = "Linux"; icon = "🖥️"; }

  let browser = "";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/chrome\//.test(s) && !/chromium/.test(s)) browser = "Chrome";
  else if (/safari\//.test(s) && !/chrome/.test(s)) browser = "Safari";
  else if (/firefox\//.test(s)) browser = "Firefox";

  return { device, browser, icon };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
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
        className={`w-12 h-7 rounded-full transition disabled:opacity-50 ${
          value ? "bg-green-500" : "bg-white/10"
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full transform toggle-knob ${
            value ? "translate-x-6" : "translate-x-1"
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
  handleLockedUntil,
}: {
  open: boolean;
  initial: { handle: string; display_name: string; bio: string };
  onClose: () => void;
  onSaved: (updated: { handle: string; display_name: string; bio: string }) => void;
  handleLockedUntil?: string | null;
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
      const result = await apiFetch("/api/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          handle: handle.trim().toLowerCase(),
          display_name: displayName.trim(),
          bio: bio.trim(),
        }),
      });
      // Use the server-confirmed values
      const p = result.profile ?? {
        handle: handle.trim().toLowerCase(),
        display_name: displayName.trim(),
        bio: bio.trim(),
      };
      onSaved({
        handle: p.handle ?? handle.trim().toLowerCase(),
        display_name: p.display_name ?? displayName.trim(),
        bio: p.bio ?? bio.trim(),
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
      <div className="w-full max-w-md rounded-xl bg-[#0A1128] border border-white/[0.12] p-5 space-y-4">
        <p className="text-sm font-medium">Edit profile</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">Handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={30}
              disabled={!!(handleLockedUntil && new Date(handleLockedUntil) > new Date())}
              className="w-full bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
            />
            {handleLockedUntil && new Date(handleLockedUntil) > new Date() && (
              <p className="text-xs text-amber-400 mt-1">
                🔒 Locked until {new Date(handleLockedUntil).toLocaleDateString()}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              className="w-full bg-white/5 border border-white/[0.12] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition resize-none"
            />
            <p className="text-xs text-white/45 text-right">{bio.length}/160</p>
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
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [removingSessionId, setRemovingSessionId] = useState<string | null>(null);

  // Notification settings
  const [notifyTips, setNotifyTips] = useState(true);
  const [notifyPayouts, setNotifyPayouts] = useState(true);
  const [notifySecurity, setNotifySecurity] = useState(true);
  const [wallet2fa, setWallet2fa] = useState(false);
  const [disable2faOpen, setDisable2faOpen] = useState(false);
  const [disable2faDigits, setDisable2faDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [disable2faError, setDisable2faError] = useState("");
  const [disable2faSending, setDisable2faSending] = useState(false);
  const [disable2faVerifying, setDisable2faVerifying] = useState(false);
  const [disable2faMasked, setDisable2faMasked] = useState("");
  const disable2faRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Biometric unlock state
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricEnableOpen, setBiometricEnableOpen] = useState(false);
  const [biometricDisableOpen, setBiometricDisableOpen] = useState(false);
  const [biometricRegistering, setBiometricRegistering] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  const [toggleLoading, setToggleLoading] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const savedKeyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pageReady, setPageReady] = useState(false);
  const [handleLockedUntil, setHandleLockedUntil] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const router = useRouter();
  const { toast, show: showToast } = useToast();

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(savedKeyTimer.current);
  }, []);

  // Auto-focus disable 2FA code input
  useEffect(() => {
    if (disable2faOpen && !disable2faSending) {
      setTimeout(() => disable2faRefs.current[0]?.focus(), 100);
    }
  }, [disable2faOpen, disable2faSending]);

  // Detect biometric support + check registered credentials
  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((ok) => setBiometricSupported(ok))
      .catch(() => {});
  }, []);

  // Check if biometric is registered when wallet2fa is on
  useEffect(() => {
    if (!wallet2fa || !biometricSupported) {
      setBiometricEnabled(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/wallet/biometric");
        if (!cancelled) setBiometricEnabled(res.registered === true);
      } catch {
        if (!cancelled) setBiometricEnabled(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet2fa, biometricSupported]);

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
        .select("stripe_account_id, stripe_charges_enabled, handle, display_name, bio, handle_locked_until, account_status, kyc_status, is_verified, wallet_2fa_enabled")
        .eq("user_id", user.id)
        .maybeSingle()
        .returns<ProfileRow | null>();

      if (!mounted) return;
      setStripeConnected(Boolean((profile as Record<string, unknown> | null)?.stripe_charges_enabled));
      setHandle(profile?.handle ?? null);
      setDisplayName(profile?.display_name ?? null);
      setBio(profile?.bio ?? null);
      setHandleLockedUntil((profile as Record<string, unknown> | null)?.handle_locked_until as string ?? null);
      setAccountStatus((profile as Record<string, unknown> | null)?.account_status as string ?? "active");
      setKycStatus((profile as Record<string, unknown> | null)?.kyc_status as string ?? "none");
      setIsVerified(Boolean((profile as Record<string, unknown> | null)?.is_verified));
      setWallet2fa(Boolean((profile as Record<string, unknown> | null)?.wallet_2fa_enabled));

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

      // Load recent login sessions
      try {
        const sessData = await apiFetch("/api/settings/sessions");
        if (mounted) setSessions(sessData.sessions ?? []);
      } catch {
        // non-critical
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
      // Wallet 2FA — enable is instant, disable requires OTP verification
      if (key === "wallet_2fa_enabled") {
        if (value) {
          // ENABLE — instant + confirmation email
          setToggleLoading(true);
          setSavedKey(null);
          try {
            await apiFetch("/api/settings/wallet-2fa", {
              method: "POST",
              body: JSON.stringify({ action: "enable" }),
            });
            setWallet2fa(true);
            setSavedKey(key);
            clearTimeout(savedKeyTimer.current);
            savedKeyTimer.current = setTimeout(() => setSavedKey(null), 1500);
          } catch {
            showToast("Failed to enable", "error");
          } finally {
            setToggleLoading(false);
          }
        } else {
          // DISABLE — protected flow: open modal, send code
          setDisable2faOpen(true);
          setDisable2faDigits(["", "", "", "", "", ""]);
          setDisable2faError("");
          setDisable2faSending(true);
          try {
            const res = await apiFetch("/api/settings/wallet-2fa", {
              method: "POST",
              body: JSON.stringify({ action: "send-disable-code" }),
            });
            setDisable2faMasked(res.maskedEmail ?? "");
          } catch {
            setDisable2faError("Failed to send code");
          } finally {
            setDisable2faSending(false);
          }
        }
        return;
      }

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
        clearTimeout(savedKeyTimer.current);
        savedKeyTimer.current = setTimeout(() => setSavedKey(null), 1500);
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

  /* ── biometric enable / disable ─────────────────────── */
  const handleEnableBiometric = useCallback(async () => {
    setBiometricRegistering(true);
    setBiometricSuccess(false);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? "user";

      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "1neLink", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(userId),
            name: email || "1neLink User",
            displayName: "1neLink Wallet",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (credential) {
        const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const response = credential.response as AuthenticatorAttestationResponse;
        const pubKey = btoa(String.fromCharCode(...new Uint8Array(response.attestationObject)));

        await apiFetch("/api/wallet/biometric", {
          method: "POST",
          body: JSON.stringify({ credentialId: rawId, publicKey: pubKey }),
        });

        setBiometricEnabled(true);
        setBiometricSuccess(true);
        setBiometricEnableOpen(false);
        if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
        setTimeout(() => setBiometricSuccess(false), 2500);
      }
    } catch {
      showToast("Biometric setup cancelled", "info");
    } finally {
      setBiometricRegistering(false);
    }
  }, [email, showToast]);

  const handleDisableBiometric = useCallback(async () => {
    try {
      await apiFetch("/api/wallet/biometric", { method: "DELETE" });
      setBiometricEnabled(false);
      setBiometricDisableOpen(false);
      showToast("Biometric unlock disabled", "success");
    } catch {
      showToast("Failed to disable", "error");
    }
  }, [showToast]);

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

      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to send reset email.");

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

  /* ── remove single device session ───────────────────── */
  const removeSession = async (id: string) => {
    setRemovingSessionId(id);
    try {
      await apiFetch("/api/settings/sessions", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast("Device removed", "success");
    } catch {
      showToast("Failed to remove device", "error");
    } finally {
      setRemovingSessionId(null);
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
              className="rounded-xl bg-white/5 border border-white/[0.12] p-4 space-y-3"
            >
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="h-4 w-40 bg-white/10 rounded" />
              <div className="h-9 w-full bg-white/10 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {pageReady && (
      <div className="max-w-xl mx-auto space-y-6 pb-10 page-enter settings-bg">
        {/* ── ACCOUNT STATUS ──────────────────────────── */}
        <button
          onClick={() => router.push("/dashboard/account")}
          className="w-full rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 text-left hover:bg-white/[0.07] transition card-hover group"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Account Status</p>
            <span className="text-white/45 group-hover:text-white/60 transition text-sm">→</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${
              accountStatus === "active"
                ? "bg-emerald-500/10 text-emerald-400"
                : accountStatus === "restricted"
                  ? "bg-red-500/10 text-red-400"
                  : accountStatus === "suspended"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-white/[0.06] text-white/55"
            }`}>
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                  accountStatus === "active" ? "bg-emerald-400"
                    : accountStatus === "restricted" ? "bg-red-400"
                    : accountStatus === "suspended" ? "bg-amber-400"
                    : "bg-gray-400"
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 pulse-dot ${
                  accountStatus === "active" ? "bg-emerald-400"
                    : accountStatus === "restricted" ? "bg-red-400"
                    : accountStatus === "suspended" ? "bg-amber-400"
                    : "bg-gray-400"
                }`} />
              </span>
              {accountStatus === "active" ? "Active" : accountStatus === "restricted" ? "Restricted" : accountStatus === "suspended" ? "Suspended" : accountStatus === "closed" || accountStatus === "closed_finalized" ? "Closed" : "Active"}
            </span>
            {isVerified && (
              <span className="text-xs text-emerald-400 font-medium">✔ Verified</span>
            )}
            {kycStatus === "pending" && (
              <span className="text-xs text-yellow-400 font-medium">KYC Pending</span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-2">Tap to view account details, verification status & more</p>
        </button>

        {/* ── ACCOUNT ─────────────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-3 card-hover">
          <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Account</p>
          <p className="text-sm font-medium text-white/90">{email ?? "—"}</p>

          <div className="flex gap-2">
            <button
              onClick={sendPasswordReset}
              disabled={loading}
              className="flex-1 glass-btn-sm active:scale-[0.97] transition"
            >
              {loading ? "Sending…" : "Change password"}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              disabled={loading}
              className="flex-1 glass-btn-sm active:scale-[0.97] transition"
            >
              Log out
            </button>
          </div>

          {msg && <p className="text-sm text-emerald-400">{msg}</p>}
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>

        {/* ── SECURITY ────────────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-3 card-hover">
          <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Security</p>

          {/* Security confidence banner */}
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-300">Account protected</p>
              <p className="text-xs text-white/55">Email verified · Password set · Session monitored</p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm">Last login</span>
            <span className="text-xs text-white/50">{lastLogin ?? "—"}</span>
          </div>

          {/* ── Device / Session Log ── */}
          <button
            onClick={() => setSessionsOpen((o) => !o)}
            className="w-full flex items-center justify-between text-sm text-white/70 hover:text-white transition py-1"
          >
            <span className="flex items-center gap-2">
              <span>📱</span>
              <span>Device activity</span>
              {sessions.length > 0 && (
                <span className="text-[10px] bg-white/10 rounded-full px-1.5 py-0.5 text-white/50">
                  {sessions.length}
                </span>
              )}
            </span>
            <span className="text-xs text-white/55">{sessionsOpen ? "▲" : "▼"}</span>
          </button>

          {sessionsOpen && (
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {sessions.length === 0 ? (
                <p className="text-xs text-white/45 py-2 text-center">No login history yet</p>
              ) : (
                sessions.map((s) => {
                  const { device, browser, icon } = parseDevice(s.user_agent);
                  const label = browser ? `${device} · ${browser}` : device;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-3 border border-white/5 transition hover:bg-white/5 hover:scale-[1.01]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">{icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs text-white/80 truncate">{label}</p>
                          {s.ip_address && (
                            <p className="text-[10px] text-white/45 truncate">{s.ip_address}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[10px] text-white/55">
                          {timeAgo(s.created_at)}
                        </span>
                        <button
                          onClick={() => removeSession(s.id)}
                          disabled={removingSessionId === s.id}
                          className="text-white/20 hover:text-red-400 transition text-sm p-1.5 disabled:opacity-30"
                          title="Remove device"
                        >
                          {removingSessionId === s.id ? "…" : "✕"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <button
            onClick={signOutAll}
            disabled={loading}
            className="glass-btn-sm w-full active:scale-[0.97] transition"
          >
            Sign out of all devices
          </button>
        </div>

        {/* ── WALLET SECURITY ─────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-4 card-hover">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-white/55 font-medium">🔐 Wallet Security</p>
            {wallet2fa && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Protected
              </span>
            )}
          </div>

          {/* 1. Wallet Protection toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <span className="text-sm text-white/90">Wallet Protection</span>
                  {savedKey === "wallet_2fa_enabled" && (
                    <span className="text-xs text-emerald-400 animate-pulse ml-2">Saved</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-white/45 mt-1 ml-10">
                Requires a 6-digit code sent to your email when accessing your wallet
              </p>
            </div>
            <button
              disabled={toggleLoading}
              onClick={() => handleToggle("wallet_2fa_enabled", !wallet2fa)}
              className={`w-12 h-7 rounded-full transition disabled:opacity-50 shrink-0 ml-3 ${
                wallet2fa ? "bg-green-500" : "bg-white/10"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transform toggle-knob ${
                  wallet2fa ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 2. Biometric Unlock (only visible when supported + wallet2fa on) */}
          {biometricSupported && wallet2fa && (
            <>
              <div className="border-t border-white/5 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500 ${
                      biometricEnabled
                        ? "bg-emerald-500/15 biometric-icon-glow"
                        : "bg-white/5"
                    }`}>
                      <svg className={`w-4 h-4 transition-colors duration-300 ${
                        biometricEnabled ? "text-emerald-400" : "text-white/55"
                      }`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.342M11.25 0v.001M7.5 10.5a4.5 4.5 0 119 0c0 3.073-.574 6.017-1.622 8.726M12 10.5a1.5 1.5 0 10-3 0c0 3.378-.622 6.616-1.757 9.6" />
                      </svg>
                    </div>
                    <div>
                      {biometricEnabled ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-emerald-400 font-medium">Biometric Unlock</span>
                            {biometricSuccess && (
                              <span className="text-emerald-400 text-sm biometric-check-enter">✓</span>
                            )}
                          </div>
                          <p className="text-[11px] text-white/45">
                            Unlock instantly using Face ID or fingerprint
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-white/90">Biometric Unlock</span>
                          <p className="text-[11px] text-white/45">
                            Use Face ID or fingerprint for faster access
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {biometricEnabled ? (
                    <button
                      onClick={() => setBiometricDisableOpen(true)}
                      className="text-xs text-white/55 hover:text-white/70 px-3 py-1.5 rounded-lg border border-white/[0.12]
                        hover:border-white/20 transition shrink-0 ml-3"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => setBiometricEnableOpen(true)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition shrink-0 ml-3 active:scale-[0.97]
                        bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-400/20`}
                    >
                      Enable
                    </button>
                  )}
                </div>
              </div>

              {/* Trust messaging */}
              <p className="text-[10px] text-white/20 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Your biometric data is stored securely on your device
              </p>
            </>
          )}
        </div>

        {/* ── NOTIFICATIONS ───────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-4 card-hover">
          <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Notifications</p>

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

        {/* ── HELP / SUPPORT ────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-3 card-hover">
          <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Help</p>
          <p className="text-sm text-white/60">
            Need help? Reach our support team anytime.
          </p>
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm text-white/70">support@1nelink.com</span>
          </div>
          <a
            href="mailto:support@1nelink.com"
            className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 text-sm font-medium py-2.5 rounded-lg transition active:scale-[0.97] shadow-lg shadow-emerald-500/10"
          >
            Contact Support
          </a>
        </div>

        {/* ── PROFILE ─────────────────────────────────── */}
        <div className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-3 card-hover">
          <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Profile</p>

          <div>
            <p className="text-xs text-white/50">Handle</p>
            <p className="text-sm font-medium text-white/90">
              {handle ? `@${handle}` : "—"}
            </p>
          </div>

          <button
            onClick={() => setProfileEditOpen(true)}
            className="glass-btn-sm w-full active:scale-[0.97] transition"
          >
            Edit profile
          </button>
        </div>

        {/* ── PAYOUTS ─────────────────────────────────── */}
        <div
          id="payouts"
          className="rounded-2xl bg-white/5 border border-white/[0.12] backdrop-blur-xl p-4 space-y-3 card-hover"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-white/55 font-medium">Payouts</p>
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
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-sm font-medium py-2.5 rounded-lg transition active:scale-[0.97] shadow-lg shadow-blue-500/10 disabled:opacity-50"
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
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-sm font-medium py-2.5 rounded-lg transition active:scale-[0.97] shadow-lg shadow-blue-500/10 disabled:opacity-50"
                >
                  Withdraw
                </button>
                <button
                  onClick={() =>
                    (window.location.href =
                      "/dashboard/onboarding?manage=1")
                  }
                  disabled={loading}
                  className="flex-1 glass-btn-sm active:scale-[0.97] transition"
                >
                  Settings
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-white/50">
            Identity verification handled securely by Stripe. We never store
            SSN or ID documents.
          </p>
        </div>

        {/* ── DANGER ZONE ─────────────────────────────── */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-3 card-hover">
          <p className="text-xs uppercase tracking-wider text-red-400/80 font-medium">Danger Zone</p>
          <p className="text-sm text-white/60">
            Permanently delete your account and all data.
          </p>

          <button
            onClick={() => setDeleteOpen(true)}
            disabled={loading}
            className="bg-red-600/80 hover:bg-red-600 text-sm font-medium py-2 px-4 rounded-lg transition active:scale-[0.97] shadow-lg shadow-red-500/10 disabled:opacity-50"
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
                : "bg-white/10 border border-white/[0.12]"
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
        handleLockedUntil={handleLockedUntil}
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

      {/* ── Disable Wallet 2FA Modal ── */}
      {disable2faOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-black border border-white/[0.12] rounded-2xl p-6 w-[340px] text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-400/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">Disable wallet protection?</h3>
              <p className="text-xs text-red-400/80 mt-1">
                This makes your wallet less secure
              </p>
              {disable2faMasked && (
                <p className="text-xs text-white/55 mt-2">
                  Code sent to <span className="text-white/60">{disable2faMasked}</span>
                </p>
              )}
            </div>

            {/* 6-digit input */}
            <div className="flex justify-center gap-2">
              {disable2faDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { disable2faRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(-1);
                    setDisable2faError("");
                    setDisable2faDigits((prev) => {
                      const next = [...prev];
                      next[i] = d;
                      return next;
                    });
                    if (d && i < 5) disable2faRefs.current[i + 1]?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !disable2faDigits[i] && i > 0) {
                      disable2faRefs.current[i - 1]?.focus();
                    }
                  }}
                  disabled={disable2faVerifying || disable2faSending}
                  className="w-10 h-12 bg-white/5 border border-white/[0.12] rounded-xl text-center text-lg font-semibold text-white
                    focus:border-red-400/50 focus:ring-1 focus:ring-red-400/30 outline-none
                    disabled:opacity-50 transition"
                />
              ))}
            </div>

            {disable2faError && (
              <p className="text-red-400 text-xs">{disable2faError}</p>
            )}
            {disable2faSending && (
              <p className="text-xs text-white/55">Sending code…</p>
            )}
            {disable2faVerifying && (
              <p className="text-xs text-white/55">Verifying…</p>
            )}

            <button
              onClick={async () => {
                const code = disable2faDigits.join("");
                if (code.length !== 6) {
                  setDisable2faError("Enter all 6 digits");
                  return;
                }
                setDisable2faVerifying(true);
                setDisable2faError("");
                try {
                  const res = await apiFetch("/api/settings/wallet-2fa", {
                    method: "POST",
                    body: JSON.stringify({ action: "disable", code }),
                  });
                  if (res.success || res.enabled === false) {
                    setWallet2fa(false);
                    setDisable2faOpen(false);
                    showToast("Wallet protection disabled", "success");
                  }
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Verification failed";
                  setDisable2faError(msg);
                  setDisable2faDigits(["", "", "", "", "", ""]);
                  disable2faRefs.current[0]?.focus();
                } finally {
                  setDisable2faVerifying(false);
                }
              }}
              disabled={disable2faVerifying || disable2faDigits.some((d) => !d)}
              className="w-full py-2.5 rounded-xl bg-red-500/20 text-red-400 font-medium hover:bg-red-500/30
                transition active:scale-[0.97] disabled:opacity-40"
            >
              {disable2faVerifying ? "Verifying…" : "Confirm disable"}
            </button>

            <button
              onClick={() => setDisable2faOpen(false)}
              className="text-xs text-white/50 hover:text-white/80 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Enable Biometric Modal ── */}
      {biometricEnableOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-black border border-white/[0.12] rounded-2xl p-6 w-[340px] text-center space-y-5">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-all duration-500 ${
              biometricRegistering
                ? "bg-emerald-500/20 border-2 border-emerald-400/30 biometric-pulse"
                : "bg-emerald-500/10 border border-emerald-400/20"
            }`}>
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.342M11.25 0v.001M7.5 10.5a4.5 4.5 0 119 0c0 3.073-.574 6.017-1.622 8.726M12 10.5a1.5 1.5 0 10-3 0c0 3.378-.622 6.616-1.757 9.6" />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white">Enable Biometric Unlock</h3>
              <p className="text-sm text-white/50 mt-2">
                Use your device&apos;s Face ID or fingerprint to quickly access your wallet.
              </p>
            </div>

            <p className="text-[11px] text-white/25 flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Your biometric data never leaves your device
            </p>

            <button
              onClick={handleEnableBiometric}
              disabled={biometricRegistering}
              className="w-full py-3 rounded-xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400
                transition active:scale-[0.97] disabled:opacity-60"
            >
              {biometricRegistering ? "Waiting for device…" : "Enable"}
            </button>

            <button
              onClick={() => setBiometricEnableOpen(false)}
              disabled={biometricRegistering}
              className="text-xs text-white/50 hover:text-white/80 transition disabled:opacity-30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Disable Biometric Confirmation Modal ── */}
      {biometricDisableOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-black border border-white/[0.12] rounded-2xl p-6 w-[340px] text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-400/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.342M11.25 0v.001M7.5 10.5a4.5 4.5 0 119 0c0 3.073-.574 6.017-1.622 8.726M12 10.5a1.5 1.5 0 10-3 0c0 3.378-.622 6.616-1.757 9.6" />
              </svg>
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">Disable Biometric Unlock?</h3>
              <p className="text-sm text-white/50 mt-1">
                You&apos;ll need to enter a code each time you access your wallet.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setBiometricDisableOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/[0.12] text-sm text-white/70
                  hover:bg-white/10 transition active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                onClick={handleDisableBiometric}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium
                  hover:bg-red-500/30 transition active:scale-[0.97]"
              >
                Disable
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
