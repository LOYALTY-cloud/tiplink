"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { THEME_KEYS, isThemeUnlocked, THEME_PRICE_LABEL, BUNDLE_PRICE_LABEL } from "@/lib/themes";
import { getTheme } from "@/lib/getTheme";
import { THEME_META } from "@/lib/themeMeta";
import ThemePreviewModal from "@/components/ThemePreviewModal";

type ProfileData = {
  account_status: string | null;
  status_reason: string | null;
  restricted_until: string | null;
  restriction_count: number | null;
  kyc_status: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  email: string | null;
  handle: string | null;
  display_name: string | null;
};

const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  active:           { label: "Active",     color: "text-emerald-400", icon: "🟢" },
  restricted:       { label: "Restricted", color: "text-red-400",     icon: "🔴" },
  suspended:        { label: "Suspended",  color: "text-amber-400",   icon: "🟡" },
  closed:           { label: "Closed",     color: "text-gray-400",    icon: "⚫" },
  closed_finalized: { label: "Closed",     color: "text-gray-500",    icon: "⚫" },
};

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Theme state
  const [profileTheme, setProfileTheme] = useState<string>("default");
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>([]);
  const [themePurchasing, setThemePurchasing] = useState(false);
  const [modalTheme, setModalTheme] = useState<string | null>(null);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("account_status, status_reason, restricted_until, restriction_count, kyc_status, is_verified, created_at, email, handle, display_name, theme")
        .eq("user_id", userRes.user.id)
        .maybeSingle();

      setProfile(prof as ProfileData | null);
      setProfileTheme((prof as any)?.theme || "default");
      setLoading(false);

      // Load unlocked themes and wallet balance
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          const [themesRes, balanceRes] = await Promise.all([
            fetch("/api/themes/list", {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch("/api/wallet/balance", {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);
          const themesJson = await themesRes.json();
          setUnlockedThemes(themesJson.unlocked ?? []);
          const balanceJson = await balanceRes.json();
          setWalletBalance(balanceJson.balance ?? 0);
        }
      } catch {}
    })();
  }, [router]);

  // Handle theme purchase success redirect
  useEffect(() => {
    if (searchParams.get("theme_success") === "true") {
      setThemeMsg("Theme unlocked! 🎉");
      setTimeout(() => setThemeMsg(null), 4000);
      (async () => {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          const res = await fetch("/api/themes/list", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json();
          setUnlockedThemes(json.unlocked ?? []);
        }
      })();
      router.replace("/dashboard/account", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const status = profile.account_status ?? "active";
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.active;
  const reason = profile.status_reason;

  // Format restricted_until as readable duration
  const restrictedUntilLabel = profile.restricted_until
    ? new Date(profile.restricted_until).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className={ui.h2}>Account</h1>

      {/* Account Status Card */}
      <div className={`${ui.card} p-5 space-y-3`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted}`}>Account Status</p>

        <div className="flex items-center gap-2">
          <span className="text-lg">{display.icon}</span>
          <span className={`text-xl font-bold ${display.color}`}>{display.label}</span>
        </div>

        {/* Reason */}
        {status !== "active" && (
          <p className={`text-sm ${ui.muted}`}>
            {reason || "There is an issue with your account."}
          </p>
        )}

        {/* Restricted until */}
        {status === "restricted" && restrictedUntilLabel && (
          <p className="text-xs text-red-400/70">
            Restricted until: {restrictedUntilLabel}
          </p>
        )}

        {status === "restricted" && !restrictedUntilLabel && (
          <p className="text-xs text-red-400/70">
            Restricted until further review.
          </p>
        )}

        {/* Actions per status */}
        {status === "restricted" && (
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/dashboard/account/verify"
              className="text-sm font-medium px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition"
            >
              Verify Identity
            </Link>
            <a
              href="mailto:support@1nelink.com"
              className={`text-sm font-medium ${ui.muted} hover:text-white underline underline-offset-2 transition`}
            >
              Contact Support
            </a>
          </div>
        )}

        {status === "suspended" && (
          <div className="pt-2">
            <a
              href="mailto:support@1nelink.com"
              className="text-sm font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2 transition"
            >
              Contact Support to resolve →
            </a>
          </div>
        )}

        {status === "closed" && (
          <p className={`text-xs ${ui.muted2} pt-1`}>
            You can still withdraw your remaining balance from the{" "}
            <Link href="/dashboard/wallet" className="underline hover:text-white transition">
              Wallet
            </Link>.
          </p>
        )}

        {status === "active" && profile.is_verified && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-emerald-400 text-sm font-semibold">✔ Verified</span>
            <span className={`text-xs ${ui.muted2}`}>Identity confirmed</span>
          </div>
        )}

        {status === "active" && !profile.is_verified && (
          <p className={`text-xs ${ui.muted2}`}>
            Your account is in good standing. No action required.
          </p>
        )}
      </div>

      {/* Verification Status Card */}
      <div className={`${ui.card} p-5 space-y-2`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted}`}>Identity Verification</p>
        <div className="flex items-center gap-2">
          {(!profile.kyc_status || profile.kyc_status === "none") && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-gray-500" />
              <span className="text-gray-400 font-semibold text-sm">Not Started</span>
            </>
          )}
          {profile.kyc_status === "pending" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-semibold text-sm">Pending Review</span>
            </>
          )}
          {profile.kyc_status === "approved" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-semibold text-sm">Verified ✔</span>
            </>
          )}
          {profile.kyc_status === "rejected" && (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-red-400 font-semibold text-sm">Not Approved</span>
            </>
          )}
        </div>
        {(!profile.kyc_status || profile.kyc_status === "none") && (
          <Link
            href="/dashboard/account/verify"
            className={`inline-block text-sm ${ui.muted} hover:text-white underline underline-offset-2 transition`}
          >
            Verify your identity →
          </Link>
        )}
        {profile.kyc_status === "rejected" && (
          <Link
            href="/dashboard/account/verify"
            className={`inline-block text-sm ${ui.muted} hover:text-white underline underline-offset-2 transition`}
          >
            Submit new document →
          </Link>
        )}
        {profile.kyc_status === "pending" && (
          <p className={`text-xs ${ui.muted2}`}>
            We&apos;re reviewing your document. You&apos;ll be notified once it&apos;s processed.
          </p>
        )}
        {profile.kyc_status === "approved" && (
          <p className={`text-xs ${ui.muted2}`}>
            Your identity has been confirmed. Full account access enabled.
          </p>
        )}
      </div>

      {/* Page Theme */}
      <div className={`${ui.card} p-5 space-y-4`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted}`}>Page Theme</p>
        <p className={`text-xs ${ui.muted2}`}>Choose how your public page and tip page look to visitors.</p>

        {/* Live preview */}
        {(() => {
          const t = getTheme(previewTheme ?? profileTheme);
          return (
            <div className={`rounded-xl p-4 border ${t.bg} ${t.text} ${t.wrapper} transition-all duration-300`}>
              <div className={`rounded-lg p-3 border ${t.card}`}>
                <p className="text-sm font-semibold">Preview</p>
                <p className="text-xs opacity-70 mt-1">This is how your page will look.</p>
                <button className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium ${t.button} ${t.glow}`}>Send Tip</button>
              </div>
            </div>
          );
        })()}

        {/* Theme grid */}
        <div className="grid grid-cols-3 gap-2">
          {THEME_KEYS.map((t) => {
            const active = (previewTheme ?? profileTheme) === t;
            const unlocked = isThemeUnlocked(t, unlockedThemes);
            const meta = THEME_META[t];
            return (
              <div key={t} className="relative">
                {meta?.badge && (
                  <span className="absolute -top-2 -right-2 z-10 text-[10px] font-bold bg-yellow-400 text-black px-2 py-0.5 rounded-full shadow">
                    {meta.badge}
                  </span>
                )}
                <button
                  disabled={themePurchasing}
                  onClick={() => {
                    if (unlocked) {
                      setPreviewTheme(t);
                    } else {
                      setModalTheme(t);
                    }
                  }}
                  className={`border px-3 py-2 rounded-lg text-sm capitalize transition w-full ${
                    active
                      ? "border-blue-400 bg-blue-500/20 text-blue-300"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  } ${themePurchasing ? "opacity-50 cursor-wait" : ""}`}
                >
                  {t}{!unlocked && " 🔒"}
                </button>
                {meta?.subtitle && !unlocked && (
                  <p className="text-[10px] text-white/30 text-center mt-0.5">{meta.subtitle}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Unlock All bundle */}
        {!unlockedThemes.includes("all") && (
          <button
            disabled={themePurchasing}
            onClick={() => setModalTheme("all")}
            className="w-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm font-medium py-2.5 rounded-lg hover:bg-yellow-500/20 transition disabled:opacity-50"
          >
            🔓 Unlock All Themes — {BUNDLE_PRICE_LABEL}
            {walletBalance >= 4.99 && (
              <span className="ml-1 text-[10px] text-emerald-300">✓ Balance covers this</span>
            )}
          </button>
        )}

        <p className={`text-xs ${ui.muted2} text-center`}>
          Free: default, dark · Premium themes: {THEME_PRICE_LABEL} each
        </p>

        {/* Save button */}
        <button
          disabled={themeSaving || (previewTheme ?? profileTheme) === profileTheme}
          onClick={async () => {
            const chosen = previewTheme ?? profileTheme;
            if (!isThemeUnlocked(chosen, unlockedThemes)) {
              setThemeMsg("Unlock this theme first");
              return;
            }
            setThemeSaving(true);
            try {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              const res = await fetch("/api/profile/theme", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ theme: chosen }),
              });
              if (!res.ok) throw new Error((await res.json()).error);
              setProfileTheme(chosen);
              setPreviewTheme(null);
              setThemeMsg("Theme saved ✔");
              setTimeout(() => setThemeMsg(null), 2000);
            } catch (e: unknown) {
              setThemeMsg(e instanceof Error ? e.message : "Failed to save theme");
            } finally {
              setThemeSaving(false);
            }
          }}
          className={`w-full text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-40 ${
            themeSaving || (previewTheme ?? profileTheme) === profileTheme
              ? "bg-blue-600/50 text-white/50"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {themeSaving ? "Saving…" : "Save theme"}
        </button>

        {themeMsg && (
          <p className="text-center text-sm text-emerald-400 animate-pulse">{themeMsg}</p>
        )}
      </div>

      {/* Quick Links */}
      <div className={`${ui.card} p-5 space-y-1`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted} mb-3`}>Quick Links</p>

        <Link
          href="/dashboard/wallet"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${ui.muted} hover:text-white hover:bg-white/5 transition text-sm`}
        >
          <span>💳</span> Wallet & Payouts
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${ui.muted} hover:text-white hover:bg-white/5 transition text-sm`}
        >
          <span>🔐</span> Security & Settings
        </Link>
        <Link
          href="/dashboard/profile"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${ui.muted} hover:text-white hover:bg-white/5 transition text-sm`}
        >
          <span>👤</span> Edit Profile
        </Link>
        <Link
          href="/dashboard/support"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${ui.muted} hover:text-white hover:bg-white/5 transition text-sm`}
        >
          <span>📄</span> Help & Support
        </Link>
      </div>

      {/* Account Info */}
      <div className={`${ui.card} p-5`}>
        <p className={`text-xs font-medium uppercase tracking-wider ${ui.muted} mb-3`}>Account Info</p>
        <dl className="space-y-2 text-sm">
          {profile.display_name && (
            <div className="flex justify-between">
              <dt className={ui.muted}>Name</dt>
              <dd>{profile.display_name}</dd>
            </div>
          )}
          {profile.handle && (
            <div className="flex justify-between">
              <dt className={ui.muted}>Handle</dt>
              <dd>@{profile.handle}</dd>
            </div>
          )}
          {profile.email && (
            <div className="flex justify-between">
              <dt className={ui.muted}>Email</dt>
              <dd>{profile.email}</dd>
            </div>
          )}
          {memberSince && (
            <div className="flex justify-between">
              <dt className={ui.muted}>Member since</dt>
              <dd>{memberSince}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Theme Preview Modal */}
      {modalTheme && (
        <ThemePreviewModal
          themeKey={modalTheme === "all" ? "gradient" : modalTheme}
          isBundle={modalTheme === "all"}
          balance={walletBalance}
          purchasing={themePurchasing}
          onClose={() => setModalTheme(null)}
          onUnlockCard={async () => {
            const t = modalTheme;
            setModalTheme(null);
            setThemePurchasing(true);
            try {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              const res = await fetch("/api/themes/checkout", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ theme: t }),
              });
              const data = await res.json();
              if (data.url) window.location.href = data.url;
              else { setThemeMsg(data.error || "Purchase failed"); setThemePurchasing(false); }
            } catch { setThemeMsg("Purchase failed"); setThemePurchasing(false); }
          }}
          onUnlockBalance={async () => {
            const t = modalTheme;
            const deductPrice = t === "all" ? 4.99 : 1.99;
            setThemePurchasing(true);
            try {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              const res = await fetch("/api/themes/purchase-with-balance", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ theme: t }),
              });
              const data = await res.json();
              if (res.ok) {
                setModalTheme(null);
                setUnlockedThemes((prev) => [...prev, t]);
                setWalletBalance((prev) => prev - deductPrice);
                setThemeMsg(t === "all" ? "All themes unlocked! 🎉" : "Theme unlocked! 🎉");
                setTimeout(() => setThemeMsg(null), 4000);
              } else {
                setThemeMsg(data.error || "Purchase failed");
              }
            } catch { setThemeMsg("Purchase failed"); }
            setThemePurchasing(false);
          }}
        />
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <AccountContent />
    </Suspense>
  );
}
