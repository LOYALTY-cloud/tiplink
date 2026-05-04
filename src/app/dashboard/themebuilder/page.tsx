"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ThemeConfig } from "@/components/ThemePreview";
import StoreBillingCard from "@/components/StoreBillingCard";
import PayoutCard from "@/components/payout/PayoutCard";
import {
  MOTION_LABELS,
  ANIMATION_LABELS,
  OVERLAY_LABELS,
  LIGHTING_LABELS,
} from "@/lib/animationAccess";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tab = "themes" | "analytics" | "store";

type CreatorStore = {
  id: string;
  store_name: string | null;
  slug: string | null;
  description: string | null;
  is_active: boolean;
  billing_type: "balance" | "stripe" | null;
  renews_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  avatar_url: string | null;
  banner_url: string | null;
};

type SavedTheme = {
  id: string;
  name: string;
  config: ThemeConfig;
  is_active: boolean;
  is_market_active?: boolean;
  created_at: string;
  price?: number | null;
  is_public?: boolean;
  unlock_count?: number;
};

type BalanceData = {
  pending: number;
  available: number;
  min_payout: number;
  stripe_ready: boolean;
  has_payout_card: boolean;
};

type PayoutRow = {
  id: string;
  amount: number;
  status: string;
  receipt_url: string | null;
  tax_year: number | null;
  stripe_transfer_id: string | null;
  requested_at: string | null;
  created_at: string;
  processed_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
};

type TaxSummary = {
  year: number;
  total_earnings: number;
  total_payouts: number;
};

type AnalyticsData = {
  total_earnings: number;
  sale_count: number;
  unlock_count: number;
  avg_price: number;
  top_themes: { id: string; name: string; earnings: number; sales: number }[];
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  // Use getSession for the token but validate user freshness — getSession alone
  // can return a stale cached session if the user switched accounts.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  // Refresh if close to expiry (within 60s) to ensure we always have a valid token
  const expiresAt = sessionData.session.expires_at ?? 0;
  if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }
  return sessionData.session.access_token;
}

async function uploadStoreAsset(
  file: File,
  type: "avatar" | "banner",
  token: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  const res = await fetch("/api/store/upload-asset", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json.url as string;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <p className="text-xs text-white/40">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function ActionCard({
  title,
  icon,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  icon: string;
  subtitle?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border rounded-2xl p-4 text-left hover:bg-white/5 transition group w-full ${
        active
          ? "bg-white/[0.06] border-white/25 shadow-sm"
          : "bg-white/[0.03] border-white/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span
          className={`text-xs transition ${
            active
              ? "text-white/50"
              : "text-white/20 group-hover:text-white/50"
          }`}
        >
          {active ? "↑" : "→"}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {subtitle && (
        <p className="text-xs text-white/40 mt-0.5 truncate">{subtitle}</p>
      )}
    </button>
  );
}

function ThemeSwatch({ config }: { config: ThemeConfig }) {
  const isVideoTheme = config.backgroundMediaType === "video" || Boolean(config.backgroundVideo);
  const previewBackground = isVideoTheme
    ? config.backgroundVideoPoster || config.background
    : config.background;

  return (
    <div
      className="w-full h-28 rounded-xl relative overflow-hidden"
      style={{
        background: previewBackground
          ? `url(${previewBackground}) center/cover no-repeat`
          : "#000",
      }}
    >
      {previewBackground && <div className="absolute inset-0 bg-black/50" />}
      {isVideoTheme && previewBackground && (
        <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">
          video
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1.5 px-3">
        <div className="w-8 h-8 rounded-lg bg-white/20" />
        <div
          className="px-4 py-1 rounded-lg text-[10px] font-semibold text-black"
          style={{ background: config.primaryColor ?? "#00ff99" }}
        >
          Send Tip
        </div>
        <div
          className="w-full max-w-[120px] h-5 rounded-md opacity-80"
          style={{ background: config.accentColor ?? "#111" }}
        />
      </div>
    </div>
  );
}

function ThemePreviewModal({
  theme,
  onClose,
  onApply,
  onRemove,
}: {
  theme: SavedTheme;
  onClose: () => void;
  onApply: (id: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const cfg = theme.config;
  const isVideoTheme = cfg.backgroundMediaType === "video" || Boolean(cfg.backgroundVideo);
  const previewBackground = isVideoTheme
    ? cfg.backgroundVideoPoster || cfg.background
    : cfg.background;
  const textColor = cfg.textColor || "#fff";
  const mutedColor = textColor + "99";
  const cardBg = cfg.accentColor || "rgba(255,255,255,0.04)";
  const inputBg = "rgba(255,255,255,0.07)";
  const border = "1px solid rgba(255,255,255,0.12)";
  const primary = cfg.primaryColor || "#00ff99";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1">
          <div
            className="relative"
            style={{
              background: previewBackground
                ? `url(${previewBackground}) center/cover no-repeat`
                : "#060D1F",
              color: textColor,
            }}
          >
            {previewBackground && <div className="absolute inset-0 bg-black/55" />}
            {isVideoTheme && previewBackground && (
              <div className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">
                video
              </div>
            )}
            <div className="relative">
              <div className="h-28 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
              <div className="absolute inset-x-0 top-14 flex justify-center">
                <div
                  className="h-20 w-20 rounded-2xl overflow-hidden border flex items-center justify-center font-semibold text-2xl"
                  style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.15)", color: textColor }}
                >
                  C
                </div>
              </div>
            </div>
            <div className="relative z-10 mx-auto max-w-md px-5 pb-6">
              <div className="pt-12 text-center mb-6">
                <div className="text-2xl font-semibold tracking-tight" style={{ color: textColor }}>DGO WORLD</div>
                <div className="mt-1 text-sm" style={{ color: mutedColor }}>@born2win</div>
              </div>
              <div className="rounded-2xl p-5" style={{ background: cardBg, border, color: textColor }}>
                <div className="flex items-center justify-end mb-4">
                  <div className="h-9 w-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                    <span className="text-emerald-300 font-semibold">$</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[5, 10, 20].map((p, i) => (
                    <div
                      key={p}
                      className="rounded-lg px-4 py-3 text-sm font-semibold text-center"
                      style={i === 0 ? { background: primary, color: "#000" } : { background: inputBg, border, color: textColor }}
                    >
                      ${p}
                    </div>
                  ))}
                </div>
                <div className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-center" style={{ background: inputBg, border, color: textColor }}>Custom</div>
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2" style={{ color: textColor }}>Leave a note (optional)</div>
                  <div className="w-full rounded-xl px-4 py-3 text-sm min-h-[72px]" style={{ background: inputBg, border, color: mutedColor }}>Say something nice…</div>
                </div>
                <div className="mt-4 rounded-xl p-3" style={{ background: inputBg, border }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: textColor }}>Secure payment</div>
                      <div className="text-xs" style={{ color: mutedColor }}>Powered by Stripe · 256-bit encryption</div>
                    </div>
                  </div>
                  <div className="w-full rounded-xl py-3 text-sm font-semibold text-center" style={{ background: primary, color: "#000" }}>Continue to payment</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[#0A1128] border-t border-white/[0.12] p-4 space-y-3">
          <p className="text-sm text-white/70 text-center">Preview — <span className="font-semibold text-white">{theme.name}</span></p>
          {!theme.is_active ? (
            <button
              onClick={async () => { setApplying(true); await onApply(theme.id); setApplying(false); onClose(); }}
              disabled={applying}
              className="w-full text-sm font-semibold py-2.5 rounded-xl transition bg-emerald-600 hover:bg-emerald-500 text-white ring-1 ring-emerald-400/30 disabled:opacity-50"
            >
              {applying ? "Applying…" : "Apply Theme"}
            </button>
          ) : (
            <button
              onClick={async () => { setApplying(true); await onRemove(); setApplying(false); onClose(); }}
              disabled={applying}
              className="w-full text-sm font-semibold py-2.5 rounded-xl transition bg-red-600/80 hover:bg-red-500 text-white ring-1 ring-red-400/30 disabled:opacity-50"
            >
              {applying ? "Removing…" : "Remove Theme"}
            </button>
          )}
          <Link href={`/dashboard/themebuilder/edit/${theme.id}`} className="block w-full py-2.5 text-center rounded-xl bg-white/10 hover:bg-white/15 transition text-sm font-semibold text-white/70">Edit Theme</Link>
          <button onClick={onClose} className="w-full text-sm text-white/55 hover:text-white/70 transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  onApply,
  onRemove,
  onDelete,
  onToggleMarketActive,
  onPreview,
}: {
  theme: SavedTheme;
  onApply: (id: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleMarketActive: (id: string, nextActive: boolean) => Promise<void>;
  onPreview: (theme: SavedTheme) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [togglingMarket, setTogglingMarket] = useState(false);
  const isMarketActive = theme.is_market_active !== false;
  return (
    <div className="bg-[#111] border border-white/[0.08] rounded-2xl p-3 flex flex-col gap-3 hover:scale-[1.02] transition-transform duration-150">
      <ThemeSwatch config={theme.config} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold truncate max-w-[140px]">{theme.name}</p>
          <p className="text-[11px] text-white/40">
            {new Date(theme.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {theme.is_active && (
            <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Active</span>
          )}
          {!isMarketActive && (
            <span className="text-[10px] font-medium text-red-300 bg-red-500/10 px-2 py-0.5 rounded-full">Market Off</span>
          )}
          <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            {theme.price ? `$${theme.price.toFixed(2)}` : "Free"}
            {theme.unlock_count ? ` · ${theme.unlock_count} unlocks` : ""}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onPreview(theme)} className="w-full py-2 rounded-xl bg-white/[0.07] hover:bg-white/15 transition text-xs font-medium">Preview</button>
        <Link href={`/dashboard/themebuilder/edit/${theme.id}`} className="w-full py-2 text-center rounded-xl bg-white/10 hover:bg-white/15 transition text-xs font-medium">Edit Theme</Link>
        <button
          onClick={async () => {
            setTogglingMarket(true);
            try {
              await onToggleMarketActive(theme.id, !isMarketActive);
            } finally {
              setTogglingMarket(false);
            }
          }}
          disabled={togglingMarket}
          className={`w-full py-2 rounded-xl text-xs font-medium transition disabled:opacity-50 ${
            isMarketActive
              ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
              : "bg-white/10 hover:bg-white/20 text-white/70"
          }`}
        >
          {togglingMarket ? "Updating…" : isMarketActive ? "Deactivate" : "Activate for Sale"}
        </button>
        {!theme.is_active ? (
          <button
            onClick={async () => { setApplying(true); await onApply(theme.id); setApplying(false); }}
            disabled={applying}
            className="w-full py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply Theme"}
          </button>
        ) : (
          <button
            onClick={async () => { setApplying(true); await onRemove(); setApplying(false); }}
            disabled={applying}
            className="w-full py-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {applying ? "Removing…" : "Remove Theme"}
          </button>
        )}
        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={async () => { setDeleting(true); await onDelete(theme.id); }}
              disabled={deleting}
              className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 text-xs font-medium transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="w-full py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────

export default function ThemeBuilderDashboard() {
  const [unlockedThemeId, setUnlockedThemeId] = useState<string | null>(null);
  const [storeSuccess, setStoreSuccess] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("themes");
  const [creatorGateChecked, setCreatorGateChecked] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<{ total_sales: number; owner_elite: boolean } | null>(null);

  // Themes tab
  const [themes, setThemes] = useState<SavedTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] = useState<SavedTheme | null>(null);
  // Analytics + balance tab
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutState, setPayoutState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRow[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsLive, setPayoutsLive] = useState(false);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [taxSummaryLoading, setTaxSummaryLoading] = useState(false);
  const [selectedTaxYear, setSelectedTaxYear] = useState(new Date().getFullYear());
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activeStorePanel, setActiveStorePanel] = useState<string | null>(null);
  
  // Store tab
  const [store, setStore] = useState<CreatorStore | null | undefined>(undefined);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeErr, setStoreErr] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaveMsg, setStoreSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [storeNameAvailable, setStoreNameAvailable] = useState<boolean | null>(null);
  const [storeNameChecking, setStoreNameChecking] = useState(false);
  const storeNameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [publishingTheme, setPublishingTheme] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadThemes = useCallback(async () => {
    setThemesLoading(true);
    setThemesError(null);
    try {
      const token = await getToken();
      if (!token) { setThemesError("Not signed in"); setThemesLoading(false); return; }
      const res = await fetch("/api/themes/saved", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setThemes((json.themes ?? []).map((theme: SavedTheme) => ({
        ...theme,
        is_market_active: theme.is_market_active !== false,
      })));
    } catch (e) {
      setThemesError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setThemesLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/themes/analytics", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setAnalytics(json);
    } catch (e) {
      setAnalyticsError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/themes/balance", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBalance(await res.json());
    } catch {
      // non-critical — analytics still shows
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const loadPayoutHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPayoutsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/themes/payouts", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json();
        setPayoutHistory(json.payouts ?? []);
      }
    } catch {
      // non-critical
    } finally {
      if (!opts?.silent) setPayoutsLoading(false);
    }
  }, []);

  const loadTaxSummary = useCallback(async (year: number) => {
    setTaxSummaryLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/themes/tax-summary?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTaxSummary(await res.json());
    } catch {
      // non-critical
    } finally {
      setTaxSummaryLoading(false);
    }
  }, []);

  const loadStore = useCallback(async () => {
    setStoreLoading(true);
    setStoreErr(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/store/me", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load store");
      setStore(json.store ?? null);
      if (json.store) {
        setStoreName(json.store.store_name ?? "");
        setStoreSlug(json.store.slug ?? "");
        setStoreDesc(json.store.description ?? "");
      }
    } catch (e) {
      setStoreErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setStoreLoading(false);
    }
  }, []);

  // ── Creator gate ───────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUnlockedThemeId(params.get("theme_unlocked"));
    setStoreSuccess(params.get("store") === "success");
    setBillingSuccess(params.get("billing") === "success");
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const token = await getToken();
      if (!token) { router.replace("/login"); return; }
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      const res = await fetch("/api/creator/apply", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Fail-closed: any API error is treated as not a creator
        router.replace("/dashboard?creator_gate=1");
        return;
      }
      const json = await res.json();
      if (!json.is_creator) {
        router.replace("/dashboard?creator_gate=1");
        return;
      }
      // Require Stripe onboarding unless owner-elite
      if (!json.charges_enabled && !json.owner_elite) {
        router.replace("/dashboard/onboarding?themebuilder_gate=1");
        return;
      }
      setCreatorProfile({
        total_sales: json.total_sales ?? 0,
        owner_elite: json.owner_elite === true,
      });

      // ── Subscribe to real-time profile updates ──
      if (userId) {
        channel = supabase
          .channel(`creator-profile-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "profiles",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const updated = payload.new as {
                total_sales?: number;
                owner_elite?: boolean;
              };
              setCreatorProfile((prev) => ({
                total_sales: updated.total_sales ?? prev?.total_sales ?? 0,
                owner_elite: updated.owner_elite ?? prev?.owner_elite ?? false,
              }));
            }
          )
          .subscribe();
      }
      setCreatorGateChecked(true);
    })();

    // Cleanup subscription on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => { if (creatorGateChecked) loadThemes(); }, [loadThemes, creatorGateChecked]);

  useEffect(() => {
    if (tab === "analytics") {
      if (!analytics && !analyticsLoading) loadAnalytics();
      if (!balance && !balanceLoading) loadBalance();
      if (payoutHistory.length === 0 && !payoutsLoading) loadPayoutHistory();
      if (!taxSummary && !taxSummaryLoading) loadTaxSummary(selectedTaxYear);
    }
    if (tab === "store" && store === undefined && !storeLoading) loadStore();
  }, [tab]);

  useEffect(() => {
    if (tab !== "analytics") return;

    setPayoutsLive(true);
    const interval = window.setInterval(() => {
      void loadPayoutHistory({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(interval);
      setPayoutsLive(false);
    };
  }, [tab, loadPayoutHistory]);

  // Auto-open wallet panel when stripe isn't set up yet
  useEffect(() => {
    if (balance && !balance.stripe_ready) setActiveCard("wallet");
  }, [balance]);

  // Reset active card when navigating away from analytics
  useEffect(() => {
    if (tab !== "analytics") setActiveCard(null);
  }, [tab]);

  // Reset active store panel when navigating away from store
  useEffect(() => {
    if (tab !== "store") setActiveStorePanel(null);
  }, [tab]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function applyTheme(themeId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/themes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ theme_id: themeId }),
    });
    if (res.ok) setThemes((prev) => prev.map((t) => ({ ...t, is_active: t.id === themeId })));
  }

  async function removeTheme() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/themes/apply", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setThemes((prev) => prev.map((t) => ({ ...t, is_active: false })));
  }

  async function deleteTheme(themeId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/themes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ theme_id: themeId }),
    });
    if (res.ok) setThemes((prev) => prev.filter((t) => t.id !== themeId));
  }

  async function toggleThemeMarketActive(themeId: string, nextActive: boolean) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/themes/market-active", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ theme_id: themeId, active: nextActive }),
    });
    if (!res.ok) return;

    setThemes((prev) => prev.map((t) => {
      if (t.id !== themeId) return t;
      return {
        ...t,
        is_market_active: nextActive,
        is_public: nextActive ? t.is_public : false,
      };
    }));

    if (!nextActive) {
    }
  }

  async function downloadTax(format: "csv" | "pdf") {
    const setter = format === "csv" ? setExportingCSV : setExportingPDF;
    setter(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/themes/tax/export/${format}?year=${selectedTaxYear}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tiplink_tax_${selectedTaxYear}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setter(false);
    }
  }

  async function requestPayout() {
    const amount = parseFloat(payoutAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPayoutState("loading");
    setPayoutMsg(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/themes/payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setPayoutState("success");
      setPayoutMsg("Payout request submitted! Funds will be transferred within 1 business day.");
      setPayoutAmount("");
      // Refresh balance + history
      loadBalance();
      loadPayoutHistory();
    } catch (e) {
      setPayoutState("error");
      setPayoutMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Post-payment unlock banner */}
      {unlockedThemeId && (
        <div className="flex items-center gap-3 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3 text-sm text-green-300">
          <span>✓</span>
          <span>Theme unlocked! You can now apply it to your public page.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Theme Builder</h1>
          <p className="text-sm text-white/40 mt-1">Build · monetize · distribute</p>
        </div>
        <Link
          href="/dashboard/themebuilder/create"
          className="bg-white text-black px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/90 transition shadow-sm"
        >
          + Create Theme
        </Link>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2">
        {(["themes", "analytics", "store"] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === key
                ? "bg-white text-black"
                : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80"
            }`}
          >
            {key === "themes" ? "Themes" : key === "analytics" ? "Analytics" : "Store"}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          THEMES TAB
      ═══════════════════════════════════════ */}
      {tab === "themes" && (
        <div className="space-y-6">

          {/* Stats strip */}
          {!themesLoading && !themesError && themes.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Themes" value={themes.length} />
              <StatCard label="Active" value={themes.filter((t) => t.is_active).length} />
              <StatCard label="For Sale" value={themes.filter((t) => t.is_public && t.price).length} />
              <StatCard label="Total Unlocks" value={themes.reduce((s, t) => s + (t.unlock_count ?? 0), 0)} />
            </div>
          )}

          {/* Loading */}
          {themesLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 rounded-2xl bg-white/5 animate-pulse" />)}
            </div>
          )}

          {/* Error */}
          {!themesLoading && themesError && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-4">
              {themesError} — <button onClick={loadThemes} className="underline">retry</button>
            </div>
          )}

          {/* Empty */}
          {!themesLoading && !themesError && themes.length === 0 && (
            <div className="text-center py-20 text-white/40">
              <p className="text-5xl mb-4">🎨</p>
              <p className="text-base font-medium">No themes yet</p>
              <p className="text-sm mt-1 mb-5">Create your first custom theme</p>
              <Link href="/dashboard/themebuilder/create" className="inline-block bg-white text-black px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/90 transition">
                Create Theme
              </Link>
            </div>
          )}

          {/* Grid */}
          {!themesLoading && !themesError && themes.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {themes.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  onApply={applyTheme}
                  onRemove={removeTheme}
                  onDelete={deleteTheme}
                  onToggleMarketActive={toggleThemeMarketActive}
                  onPreview={setPreviewTheme}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          ANALYTICS TAB
      ═══════════════════════════════════════ */}
      {tab === "analytics" && (
        <div className="space-y-5">

          {/* ── Section header ─────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">Analytics</p>
            {!activeCard && <span className="text-xs text-white/40">Overview</span>}
            {activeCard && (
              <button
                onClick={() => setActiveCard(null)}
                className="text-xs text-white/40 hover:text-white transition flex items-center gap-1"
              >
                ← Back to overview
              </button>
            )}
          </div>

          {/* ── Action cards grid ──────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <ActionCard
              title="Wallet"
              icon="💳"
              subtitle={
                balance
                  ? `$${fmt(balance.available)} available`
                  : balanceLoading
                  ? "Loading…"
                  : "Tap to open"
              }
              active={activeCard === "wallet"}
              onClick={() => setActiveCard(activeCard === "wallet" ? null : "wallet")}
            />
            <ActionCard
              title="Earnings"
              icon="💰"
              subtitle={
                analytics
                  ? `$${fmt(analytics.total_earnings)} earned`
                  : analyticsLoading
                  ? "Loading…"
                  : "Tap to open"
              }
              active={activeCard === "earnings"}
              onClick={() => setActiveCard(activeCard === "earnings" ? null : "earnings")}
            />
            <ActionCard
              title="Top Themes"
              icon="🎨"
              subtitle={
                analytics
                  ? `${analytics.sale_count} sale${analytics.sale_count !== 1 ? "s" : ""}`
                  : analyticsLoading
                  ? "Loading…"
                  : "Tap to open"
              }
              active={activeCard === "top-themes"}
              onClick={() => setActiveCard(activeCard === "top-themes" ? null : "top-themes")}
            />
            <ActionCard
              title="Taxes"
              icon="🧾"
              subtitle={String(selectedTaxYear)}
              active={activeCard === "taxes"}
              onClick={() => setActiveCard(activeCard === "taxes" ? null : "taxes")}
            />
            <ActionCard
              title="Payouts"
              icon="🏦"
              subtitle={
                payoutsLoading
                  ? "Loading…"
                  : payoutHistory.length > 0
                  ? `${payoutHistory.length} record${payoutHistory.length !== 1 ? "s" : ""}`
                  : "No payouts yet"
              }
              active={activeCard === "payouts"}
              onClick={() => setActiveCard(activeCard === "payouts" ? null : "payouts")}
            />
          </div>

          {/* ── 💳 Wallet panel ────────────────────────────────── */}
          {activeCard === "wallet" && (
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4 animate-fadeIn">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Creator Wallet</p>

              {balanceLoading && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                  <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                </div>
              )}

              {balance && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-white/40">Available</p>
                      <p className="text-2xl font-semibold mt-1 text-green-400">${fmt(balance.available)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-white/40">Pending (3-day hold)</p>
                      <p className="text-2xl font-semibold mt-1 text-white/60">${fmt(balance.pending)}</p>
                    </div>
                  </div>

                  {!balance.stripe_ready ? (
                    <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl p-4">
                      <span className="text-amber-400 text-lg">⚠</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-300 font-medium">Payout account not set up</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">Connect your bank or debit card to withdraw earnings.</p>
                      </div>
                      <Link
                        href="/dashboard/stripe"
                        className="px-4 py-2 bg-amber-400 text-black text-xs font-semibold rounded-lg hover:bg-amber-300 transition shrink-0"
                      >
                        Set up
                      </Link>
                    </div>
                  ) : !balance.has_payout_card ? (
                    <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 rounded-xl p-4">
                      <span className="text-amber-400 text-lg">⚠</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-300 font-medium">No payout card on file</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">Link a debit card or bank account to receive your earnings.</p>
                      </div>
                      <Link
                        href="/dashboard/wallet"
                        className="px-4 py-2 bg-amber-400 text-black text-xs font-semibold rounded-lg hover:bg-amber-300 transition shrink-0"
                      >
                        Link card
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="relative flex-1">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                          <input
                            type="number"
                            min={balance.min_payout}
                            max={balance.available}
                            step="0.01"
                            value={payoutAmount}
                            onChange={(e) => { setPayoutAmount(e.target.value); setPayoutState("idle"); setPayoutMsg(null); }}
                            placeholder={`${balance.min_payout}.00`}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm placeholder:text-white/20 outline-none focus:border-white/30 transition"
                          />
                        </div>
                        <button
                          onClick={requestPayout}
                          disabled={
                            payoutState === "loading" ||
                            balance.available < balance.min_payout ||
                            !payoutAmount ||
                            parseFloat(payoutAmount) < balance.min_payout ||
                            parseFloat(payoutAmount) > balance.available
                          }
                          className="px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition disabled:opacity-40"
                        >
                          {payoutState === "loading" ? "Requesting…" : "Withdraw"}
                        </button>
                      </div>

                      {payoutMsg && (
                        <p className={`text-xs ${payoutState === "success" ? "text-green-400" : "text-red-400"}`}>
                          {payoutMsg}
                        </p>
                      )}

                      <p className="text-xs text-white/30">
                        Minimum payout: ${balance.min_payout} &bull; 3-day hold on new sales &bull; Sent to your linked payout card
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 💰 Earnings panel ──────────────────────────────── */}
          {activeCard === "earnings" && (
            <div className="space-y-4 animate-fadeIn">
              {analyticsLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              )}
              {analyticsError && !analyticsLoading && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-4">
                  {analyticsError} — <button onClick={() => { setAnalytics(null); loadAnalytics(); }} className="underline">retry</button>
                </div>
              )}
              {analytics && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Total Earnings" value={`$${fmt(analytics.total_earnings)}`} />
                    <StatCard label="Sales" value={analytics.sale_count} />
                    <StatCard label="Total Unlocks" value={analytics.unlock_count} />
                    <StatCard label="Avg Sale Price" value={analytics.sale_count > 0 ? `$${fmt(analytics.avg_price)}` : "—"} />
                  </div>

                  {analytics.sale_count === 0 && (
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
                      <p className="text-3xl mb-3">💰</p>
                      <p className="text-sm font-medium text-white/60">No earnings yet</p>
                      <p className="text-xs text-white/40 mt-1">Mark a theme as public with a price to start selling.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 🎨 Top Themes panel ────────────────────────────── */}
          {activeCard === "top-themes" && (
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 animate-fadeIn">
              <p className="text-sm font-semibold mb-4">Top Themes by Earnings</p>
              {analyticsLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              )}
              {analytics && analytics.top_themes.length === 0 && (
                <p className="text-sm text-white/40">No sales yet. List a theme for sale to start earning.</p>
              )}
              {analytics && analytics.top_themes.length > 0 && (
                <div className="divide-y divide-white/5">
                  {analytics.top_themes.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <span className="font-medium">{t.name}</span>
                        <span className="ml-2 text-xs text-white/40">{t.sales} sale{t.sales !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="text-green-400 font-semibold">${fmt(t.earnings)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 🧾 Taxes panel ─────────────────────────────────── */}
          {activeCard === "taxes" && (
            <div className="space-y-4 animate-fadeIn">
              {taxSummaryLoading && <div className="h-28 rounded-2xl bg-white/5 animate-pulse" />}
              {taxSummary && (
                <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold">Tax Summary ({taxSummary.year})</p>
                    <span className="text-xs text-white/30 bg-white/5 px-2.5 py-1 rounded-full">1099-ready</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-white/40">Total Earnings</p>
                      <p className="text-xl font-semibold mt-1">${fmt(taxSummary.total_earnings)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-white/40">Total Paid Out</p>
                      <p className="text-xl font-semibold mt-1">${fmt(taxSummary.total_payouts)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-white/25">
                    This summary reflects approved + paid theme sales for {taxSummary.year}. Keep for your records — not a substitute for professional tax advice.
                  </p>
                </div>
              )}

              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-semibold">Tax Documents</p>
                    <p className="text-xs text-white/40 mt-0.5">Download earnings reports for tax preparation</p>
                  </div>
                  <select
                    value={selectedTaxYear}
                    onChange={(e) => {
                      const yr = Number(e.target.value);
                      setSelectedTaxYear(yr);
                      loadTaxSummary(yr);
                    }}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/30 transition text-white shrink-0"
                  >
                    {Array.from({ length: new Date().getFullYear() - 2025 + 1 }, (_, i) => 2025 + i)
                      .reverse()
                      .map((yr) => (
                        <option key={yr} value={yr} className="bg-[#111]">{yr}</option>
                      ))}
                  </select>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => downloadTax("csv")}
                    disabled={exportingCSV}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition disabled:opacity-50"
                  >
                    {exportingCSV ? (
                      <span className="inline-block w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <span>↓</span>
                    )}
                    Export CSV
                  </button>
                  <button
                    onClick={() => downloadTax("pdf")}
                    disabled={exportingPDF}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white text-sm font-semibold rounded-xl hover:bg-white/15 transition disabled:opacity-50"
                  >
                    {exportingPDF ? (
                      <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>↓</span>
                    )}
                    Export PDF
                  </button>
                </div>

                <p className="text-xs text-white/25 mt-3">
                  CSV: raw data for accountants &bull; PDF: clean summary for your records &bull; 1099-ready format
                </p>
              </div>
            </div>
          )}

          {/* ── 🏦 Payouts panel ───────────────────────────────── */}
          {activeCard === "payouts" && (
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold">Payout History</p>
                {payoutsLive && payoutHistory.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Live
                  </span>
                )}
              </div>

              {payoutsLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              )}

              {!payoutsLoading && payoutHistory.length === 0 && (
                <p className="text-sm text-white/30 text-center py-6">
                  No payouts yet. Withdraw your available balance from the Wallet panel.
                </p>
              )}

              {!payoutsLoading && payoutHistory.length > 0 && (
                <div className="space-y-3">
                  {payoutHistory.map((p) => (
                    <PayoutCard key={p.id} payout={p} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ═══════════════════════════════════════
          STORE TAB
      ═══════════════════════════════════════ */}
      {tab === "store" && (
        <div className="space-y-5">

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-br from-[#020617] via-[#0a1628] to-[#0f172a] min-h-[80px]">
            {store?.banner_url && (
              <img
                src={store.banner_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
              />
            )}
            {/* subtle glow */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="relative p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 border border-white/10 shrink-0 flex items-center justify-center">
                  {store?.avatar_url ? (
                    <img src={store.avatar_url} alt="Store avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🏪</span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-semibold leading-tight">
                    {store?.store_name || storeName || "Your Store"}
                  </p>
                  {store?.slug ? (
                    <a
                      href={`/store/${store.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                      /store/{store.slug}
                    </a>
                  ) : (
                    <p className="text-xs text-white/30">No URL set yet</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {store?.is_active ? (
                  <span className="flex items-center gap-1.5 text-[11px] bg-green-400/15 text-green-300 border border-green-400/20 px-3 py-1 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="text-[11px] bg-white/5 text-white/40 border border-white/10 px-3 py-1 rounded-full">
                    Inactive
                  </span>
                )}
                {creatorProfile?.owner_elite && (
                  <span className="text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-400/15 border border-emerald-400/20 px-2.5 py-1 rounded-full">
                    Owner Elite · Free
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Store section ──────────────────────────────────────────────── */}
          {creatorProfile && (
            <>
              {storeLoading && store === undefined && (
                <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              )}
              {storeErr && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                  {storeErr} — <button onClick={loadStore} className="underline hover:text-red-300 transition">retry</button>
                </div>
              )}
              {storeSuccess && (
                <div className="flex items-center gap-3 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3 text-sm text-green-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Subscription active! Customize your store to go live.
                </div>
              )}
              {billingSuccess && (
                <div className="flex items-center gap-3 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3 text-sm text-green-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Billing method updated.
                </div>
              )}

              {/* ── Subscribe CTA ─────────────────────────────────────────── */}
              {!storeLoading && store !== undefined && !store?.is_active && (
                <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-6 space-y-5">
                  <div>
                    <p className="text-base font-semibold">Open Your Theme Store</p>
                    <p className="text-sm text-white/40 mt-1 max-w-sm">
                      Publish your themes to the Theme Store. Buyers discover your store, unlock themes, and you earn.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[["🎨", "Publish themes"], ["🔍", "Get discovered"], ["💸", "Earn payouts"]].map(([icon, label]) => (
                      <div key={label} className="bg-white/5 border border-white/[0.08] rounded-xl py-3 px-2">
                        <p className="text-lg mb-1">{icon}</p>
                        <p className="text-[11px] text-white/50">{label}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      setSubscribing(true);
                      try {
                        const token = await getToken();
                        if (!token) return;
                        const res = await fetch("/api/store/subscribe", {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        const json = await res.json();
                        if (json.already_active) { await loadStore(); return; }
                        if (json.activated_with_balance || json.activated_owner_free) { await loadStore(); return; }
                        if (json.url) window.location.href = json.url;
                      } finally {
                        setSubscribing(false);
                      }
                    }}
                    disabled={subscribing}
                    className="w-full bg-gradient-to-r from-white to-gray-100 text-black py-3 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-40"
                  >
                    {subscribing
                      ? "Loading…"
                      : creatorProfile?.owner_elite
                      ? "Create Store — Free (Owner Elite)"
                      : "Create Store — $9.99 / mo"}
                  </button>
                </div>
              )}

              {/* ── Active store control center ────────────────────────────── */}
              {store?.is_active && (
                <div className="space-y-4">

                  {/* Section header + back button */}
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold">Store</p>
                    {activeStorePanel ? (
                      <button
                        onClick={() => setActiveStorePanel(null)}
                        className="text-xs text-white/40 hover:text-white transition flex items-center gap-1"
                      >
                        ← Back to store
                      </button>
                    ) : (
                      <span className="text-xs text-white/40">Control center</span>
                    )}
                  </div>

                  {/* Quick action grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <ActionCard
                      title="Customize"
                      icon="🎨"
                      subtitle="Name, avatar, banner"
                      active={activeStorePanel === "customize"}
                      onClick={() => setActiveStorePanel(activeStorePanel === "customize" ? null : "customize")}
                    />
                    <ActionCard
                      title="Inventory"
                      icon="🧱"
                      subtitle={`${themes.filter((t) => t.price && t.price > 0 && t.is_public).length} live`}
                      active={activeStorePanel === "inventory"}
                      onClick={() => setActiveStorePanel(activeStorePanel === "inventory" ? null : "inventory")}
                    />
                    <ActionCard
                      title="Analytics"
                      icon="📊"
                      subtitle={analytics ? `${analytics.sale_count} sales` : "Tap to view"}
                      active={activeStorePanel === "store-analytics"}
                      onClick={() => setActiveStorePanel(activeStorePanel === "store-analytics" ? null : "store-analytics")}
                    />
                    <ActionCard
                      title="Billing"
                      icon="💳"
                      subtitle="Subscription"
                      active={activeStorePanel === "billing"}
                      onClick={() => setActiveStorePanel(activeStorePanel === "billing" ? null : "billing")}
                    />
                    <ActionCard
                      title="View Store"
                      icon="🌐"
                      subtitle={store.slug ? `/store/${store.slug}` : "Set URL first"}
                      onClick={() => { if (store.slug) window.open(`/store/${store.slug}`, "_blank"); }}
                    />
                  </div>

                  {/* ── 🎨 Customize panel ──────────────────────────────── */}
                  {activeStorePanel === "customize" && (
                    <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-5 space-y-4 animate-fadeIn">
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Store Identity</p>

                      {/* Banner */}
                      <div>
                        <label className="text-[11px] text-white/35 uppercase tracking-wide mb-1.5 block">Store Banner</label>
                        <label className="block cursor-pointer group">
                          <div className="relative w-full h-28 rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition">
                            {store.banner_url ? (
                              <img src={store.banner_url} alt="Banner" className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-white/20 text-xs gap-2">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M2 14l4-4 3 3 4-5 5 6H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
                                Click to upload banner (4:1 landscape)
                              </div>
                            )}
                            {store.banner_url && (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="text-xs text-white font-medium">Change banner</span>
                              </div>
                            )}
                            {uploadingBanner && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-xs text-white/70">Uploading…</span>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingBanner(true);
                              setStoreSaveMsg(null);
                              try {
                                const token = await getToken();
                                if (!token) throw new Error("Not signed in");
                                const url = await uploadStoreAsset(file, "banner", token);
                                setStore((prev) => prev ? { ...prev, banner_url: url } : prev);
                                setStoreSaveMsg({ text: "Banner uploaded — click Save to apply", ok: true });
                              } catch (err) {
                                setStoreSaveMsg({ text: err instanceof Error ? err.message : "Upload failed", ok: false });
                              } finally {
                                setUploadingBanner(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      </div>

                      {/* Avatar */}
                      <div>
                        <label className="text-[11px] text-white/35 uppercase tracking-wide mb-1.5 block">Store Avatar</label>
                        <label className="flex items-center gap-4 cursor-pointer group">
                          <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 transition shrink-0">
                            {store.avatar_url ? (
                              <img src={store.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-white/25">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </div>
                            )}
                            {uploadingAvatar && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-[10px] text-white/70">…</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-white/60 group-hover:text-white/80 transition">
                              {store.avatar_url ? "Click to change avatar" : "Click to upload avatar"}
                            </p>
                            <p className="text-[11px] text-white/25 mt-0.5">Square image, shown on your store page</p>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingAvatar(true);
                              setStoreSaveMsg(null);
                              try {
                                const token = await getToken();
                                if (!token) throw new Error("Not signed in");
                                const url = await uploadStoreAsset(file, "avatar", token);
                                setStore((prev) => prev ? { ...prev, avatar_url: url } : prev);
                                setStoreSaveMsg({ text: "Avatar uploaded — click Save to apply", ok: true });
                              } catch (err) {
                                setStoreSaveMsg({ text: err instanceof Error ? err.message : "Upload failed", ok: false });
                              } finally {
                                setUploadingAvatar(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="border-t border-white/[0.06]" />

                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] text-white/35 uppercase tracking-wide mb-1.5 block">Store name</label>
                          <input
                            value={storeName}
                            onChange={(e) => {
                              const name = e.target.value;
                              setStoreName(name);
                              const derived = name
                                .toLowerCase()
                                .trim()
                                .replace(/\s+/g, "-")
                                .replace(/[^a-z0-9\-]/g, "")
                                .replace(/-+/g, "-")
                                .slice(0, 48);
                              setStoreSlug(derived);
                              setStoreNameAvailable(null);
                              if (storeNameCheckRef.current) clearTimeout(storeNameCheckRef.current);
                              if (!name.trim()) return;
                              setStoreNameChecking(true);
                              storeNameCheckRef.current = setTimeout(async () => {
                                try {
                                  const token = await getToken();
                                  if (!token) return;
                                  const res = await fetch(`/api/store/check-name?name=${encodeURIComponent(name.trim())}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  const json = await res.json();
                                  setStoreNameAvailable(json.available === true);
                                } catch { setStoreNameAvailable(null); }
                                finally { setStoreNameChecking(false); }
                              }, 500);
                            }}
                            placeholder="e.g. Neon Themes"
                            maxLength={80}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/20 outline-none focus:border-white/25 transition"
                          />
                          {storeName.trim() && (
                            <p className={`text-[11px] mt-1.5 ${
                              storeNameChecking ? "text-white/30" :
                              storeNameAvailable === true ? "text-emerald-400" :
                              storeNameAvailable === false ? "text-red-400" : "text-white/30"
                            }`}>
                              {storeNameChecking ? "Checking…" :
                               storeNameAvailable === true ? "✓ Available" :
                               storeNameAvailable === false ? "✗ Name already taken — choose another" : ""}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-[11px] text-white/35 uppercase tracking-wide mb-1.5 block">Store URL <span className="normal-case text-white/20">— auto-set from name</span></label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm select-none">/store/</span>
                            <input
                              value={storeSlug}
                              onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ""))}
                              placeholder="your-store-slug"
                              maxLength={48}
                              className="w-full bg-white/5 border border-white/10 rounded-xl pl-[72px] pr-4 py-2.5 text-sm placeholder:text-white/20 outline-none focus:border-white/25 transition font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-white/35 uppercase tracking-wide mb-1.5 block">Description <span className="normal-case text-white/20">(optional)</span></label>
                          <textarea
                            value={storeDesc}
                            onChange={(e) => setStoreDesc(e.target.value)}
                            placeholder="Describe your style or niche…"
                            maxLength={300}
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/20 outline-none focus:border-white/25 transition resize-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            setStoreSaving(true);
                            setStoreSaveMsg(null);
                            try {
                              const token = await getToken();
                              if (!token) throw new Error("Not signed in");
                              const res = await fetch("/api/store/create", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({
                                  name: storeName,
                                  slug: storeSlug,
                                  description: storeDesc,
                                  avatar_url: store.avatar_url ?? undefined,
                                  banner_url: store.banner_url ?? undefined,
                                }),
                              });
                              const json = await res.json();
                              if (!res.ok) throw new Error(json.error ?? "Failed to save");
                              setStore((prev) => prev ? { ...prev, ...json.store } : json.store);
                              setStoreSaveMsg({ text: "Saved!", ok: true });
                            } catch (e) {
                              setStoreSaveMsg({ text: e instanceof Error ? e.message : "Error", ok: false });
                            } finally {
                              setStoreSaving(false);
                            }
                          }}
                          disabled={storeSaving || !storeName.trim() || !storeSlug.trim() || storeNameAvailable === false}
                          className="px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition disabled:opacity-40"
                        >
                          {storeSaving ? "Saving…" : "Save changes"}
                        </button>
                        {storeSaveMsg && (
                          <p className={`text-xs font-medium ${storeSaveMsg.ok ? "text-green-400" : "text-red-400"}`}>
                            {storeSaveMsg.text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── 🧱 Inventory panel ──────────────────────────────── */}
                  {activeStorePanel === "inventory" && (
                    <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-5 animate-fadeIn">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold">Theme Inventory</p>
                        <span className="text-[11px] text-white/30">
                          {themes.filter((t) => t.price && t.price > 0 && t.is_public).length} published
                        </span>
                      </div>
                      <p className="text-xs text-white/35 mb-4">
                        Toggle to publish or pull themes from your store.
                      </p>
                      {themes.filter((t) => t.price && t.price > 0).length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-2xl mb-2">🎨</p>
                          <p className="text-sm text-white/30">No priced themes yet.</p>
                          <Link href="/dashboard/themebuilder/create" className="text-sm text-blue-400 hover:text-blue-300 transition mt-1 inline-block underline underline-offset-2">
                            Create a theme with a price →
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {themes.filter((t) => t.price && t.price > 0).map((t) => {
                            const cfg = t.config as Record<string, unknown>;
                            const swatch1 = typeof cfg.primaryColor === "string" ? cfg.primaryColor : "#334155";
                            const swatch2 = typeof cfg.gradientTo === "string" ? cfg.gradientTo : typeof cfg.background === "string" && cfg.background.startsWith("#") ? cfg.background : "#0f172a";
                            return (
                              <div
                                key={t.id}
                                className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/[0.07] hover:bg-white/[0.08] transition"
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-lg shrink-0 border border-white/10"
                                    style={{ background: `linear-gradient(135deg, ${swatch1}, ${swatch2})` }}
                                  />
                                  <div>
                                    <p className="text-sm font-medium leading-tight">{t.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-xs text-white/40">${(t.price as number).toFixed(2)}</p>
                                      {typeof t.unlock_count === "number" && t.unlock_count > 0 && (
                                        <span className="text-[10px] text-white/25">{t.unlock_count} sold</span>
                                      )}
                                      {t.is_market_active === false && (
                                        <span className="text-[10px] text-red-400/80">Market off</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  disabled={publishingTheme === t.id || t.is_market_active === false}
                                  onClick={async () => {
                                    setPublishingTheme(t.id);
                                    try {
                                      const token = await getToken();
                                      if (!token) return;
                                      const isPublished = t.is_public;
                                      const res = await fetch("/api/store/publish-theme", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ theme_id: t.id, publish: !isPublished }),
                                      });
                                      if (res.ok) {
                                        setThemes((prev) => prev.map((p) => p.id === t.id ? { ...p, is_public: !isPublished } : p));
                                      }
                                    } finally {
                                      setPublishingTheme(null);
                                    }
                                  }}
                                  className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition disabled:opacity-40 shrink-0 ${
                                    t.is_market_active === false
                                      ? "bg-white/5 text-white/25 cursor-not-allowed"
                                      : t.is_public
                                      ? "bg-green-500/15 text-green-400 border border-green-400/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/20"
                                      : "bg-white/10 text-white/60 border border-white/10 hover:bg-white/15 hover:text-white"
                                  }`}
                                >
                                  {publishingTheme === t.id
                                    ? "…"
                                    : t.is_market_active === false
                                    ? "Inactive"
                                    : t.is_public
                                    ? "Published ✓"
                                    : "Publish"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 📊 Analytics panel ──────────────────────────────── */}
                  {activeStorePanel === "store-analytics" && (
                    <div className="space-y-4 animate-fadeIn">
                      {analyticsLoading && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />)}
                        </div>
                      )}
                      {!analyticsLoading && analytics && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <StatCard label="Total Earnings" value={`$${fmt(analytics.total_earnings)}`} />
                          <StatCard label="Sales" value={analytics.sale_count} />
                          <StatCard label="Total Unlocks" value={analytics.unlock_count} />
                          <StatCard label="Avg Sale Price" value={analytics.sale_count > 0 ? `$${fmt(analytics.avg_price)}` : "—"} />
                        </div>
                      )}
                      {!analyticsLoading && !analytics && (
                        <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-5 text-center">
                          <p className="text-sm text-white/30">No sales data yet.</p>
                        </div>
                      )}
                      {analytics && analytics.top_themes.length > 0 && (
                        <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-5">
                          <p className="text-sm font-semibold mb-4">Top Themes by Earnings</p>
                          <div className="divide-y divide-white/5">
                            {analytics.top_themes.map((t) => (
                              <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                                <div>
                                  <span className="font-medium">{t.name}</span>
                                  <span className="ml-2 text-xs text-white/40">{t.sales} sale{t.sales !== 1 ? "s" : ""}</span>
                                </div>
                                <span className="text-green-400 font-semibold">${fmt(t.earnings)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── 💳 Billing panel ────────────────────────────────── */}
                  {activeStorePanel === "billing" && (
                    <div className="bg-[#0B1220] border border-white/10 rounded-2xl p-5 animate-fadeIn">
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Billing</p>
                      <StoreBillingCard onUpdated={loadStore} />
                    </div>
                  )}

                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewTheme && (
        <ThemePreviewModal
          theme={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onApply={async (id) => {
            await applyTheme(id);
            setPreviewTheme((prev) => prev ? { ...prev, is_active: true } : null);
          }}
          onRemove={async () => {
            await removeTheme();
            setPreviewTheme((prev) => prev ? { ...prev, is_active: false } : null);
          }}
        />
      )}

    </div>
  );
}
