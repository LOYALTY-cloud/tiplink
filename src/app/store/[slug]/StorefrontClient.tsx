"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import AnimationRenderer from "@/components/theme/AnimationRenderer";
import { getRecommendedThemes, type ThemeActivityRecord } from "@/lib/themeRecommendations";
import StoreMobileMenu from "@/components/StoreMobileMenu";
import ThemePreviewModal from "@/components/store/ThemePreviewModal";
import ThemeCheckoutModal from "@/components/store/ThemeCheckoutModal";

type StoreTheme = {
  id: string;
  name: string;
  price: number;
  base_price: number;
  upgrade_price: number | null;
  unlock_count: number;
  created_at: string | null;
  config: Record<string, unknown>;
  category_id: string | null;
  is_verified: boolean;
  category: {
    name: string | null;
    slug: string | null;
  } | null;
};

type PriceType = "owned" | "upgrade" | "full";
type ResolvedPrice = { type: PriceType; price: number };


type StoreData = {
  id: string;
  store_name: string;
  slug: string;
  description: string | null;
  total_sales: number;
  featured: boolean;
  avatar_url: string | null;
  banner_url: string | null;
  creator: {
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
  };
};

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function StorefrontClient({
  store,
  themes,
}: {
  store: StoreData;
  themes: StoreTheme[];
}) {
  const [buying, setBuying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checkoutTheme, setCheckoutTheme] = useState<{ id: string; name: string; price: number } | null>(null);
  const [resolvedPrices, setResolvedPrices] = useState<Record<string, ResolvedPrice>>({});
  const [activity, setActivity] = useState<ThemeActivityRecord[]>([]);
  const [authed, setAuthed] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<StoreTheme | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session?.user));
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const res = await fetch("/api/themes/market-pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ theme_ids: themes.map((t) => t.id) }),
        });

        if (!res.ok) {
          return;
        }

        const json = await res.json();
        if (isMounted && json?.prices && typeof json.prices === "object") {
          setResolvedPrices(json.prices as Record<string, ResolvedPrice>);
        }
      } catch {
        // Keep storefront usable with base prices if pricing lookup fails.
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [themes]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/themes/activity", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;
      const json = await res.json();
      if (isMounted && Array.isArray(json.activity)) {
        setActivity(json.activity as ThemeActivityRecord[]);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const firstVisible = themes.slice(0, 3);
      for (const theme of firstVisible) {
        if (cancelled) return;
        await fetch("/api/themes/activity", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ theme_id: theme.id, action: "view" }),
        }).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [themes]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, { slug: string; label: string }>();
    for (const t of themes) {
      if (t.category?.slug && t.category?.name) {
        map.set(t.category.slug, { slug: t.category.slug, label: t.category.name });
      }
    }

    const base = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [{ slug: "all", label: "All" }, { slug: "__free__", label: "Free" }, ...base];
  }, [themes]);

  const filteredThemes = useMemo(() => {
    let result = [...themes];

    if (category === "__free__") {
      result = result.filter((t) => Number(t.base_price ?? 0) <= 0);
    } else if (category !== "all") {
      result = result.filter((t) => (t.category?.slug ?? "") === category);
    }

    return result.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [themes, category]);

  async function buyTheme(themeId: string) {
    setBuying(themeId);
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        window.location.href = `/login?next=/store/${store.slug}`;
        return;
      }

      await fetch("/api/themes/activity", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme_id: themeId, action: "view" }),
      }).catch(() => undefined);

      // Open checkout modal for both free and paid themes
      const theme = themes.find((t) => t.id === themeId);
      const resolvedPrice = resolvedPrices[themeId]?.price ?? Number(theme?.base_price ?? 0);
      setPreviewTheme(null);
      setCheckoutTheme({ id: themeId, name: theme?.name ?? "Theme", price: resolvedPrice });
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#060D1F] text-white">
      {/* Desktop navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 hidden md:flex items-center justify-between border-b border-white/8 bg-[#060D1F]/90 backdrop-blur-md px-6 h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-bold tracking-tight text-white hover:text-white/80 transition">
            1neLink
          </Link>
          <Link href="/store" className="text-xs text-white/45 hover:text-white/80 transition">
            ← Theme Store
          </Link>
        </div>
        <nav className="flex items-center gap-4">
          {authed ? (
            <Link
              href="/dashboard"
              className="rounded-lg border border-white/12 bg-white/6 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-xs text-white/50 hover:text-white/80 transition">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90 transition"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10 md:pt-24">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StoreMobileMenu />
            <Link href="/store" className="text-xs text-white/30 hover:text-white/60 transition md:hidden">
              ← All Stores
            </Link>
          </div>
        </div>

        <div className="relative mb-8 overflow-hidden rounded-[28px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] group">
          {/* Banner */}
          <div className="relative h-48 sm:h-52 w-full overflow-hidden">
            {store.banner_url ? (
              <img
                src={store.banner_url}
                alt="Store banner"
                className="absolute inset-0 w-full h-full object-cover object-top sm:object-center transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-white/4 to-transparent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
          </div>

          {/* Content overlaid at bottom of banner */}
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                {/* Store avatar (falls back to creator avatar, then initials) */}
                {store.avatar_url || store.creator.avatar_url ? (
                  <img
                    src={store.avatar_url ?? store.creator.avatar_url!}
                    alt={store.store_name}
                    className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border-2 border-white/20 object-cover shadow-lg shrink-0"
                  />
                ) : (
                  <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-white/20 bg-white/10 text-lg font-bold text-white shadow-lg shrink-0">
                    {store.store_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70 mb-0.5">Creator Store</p>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{store.store_name}</h1>
                  {store.description && (
                    <p className="mt-1 max-w-lg text-sm text-white/60 leading-snug">{store.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm px-4 py-2.5 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">Themes</p>
                  <p className="mt-0.5 text-lg font-semibold text-white">{themes.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Creator byline */}
        <div className="-mt-3 mb-6 flex items-center gap-3 px-1">
          {store.creator.avatar_url ? (
            <img src={store.creator.avatar_url} alt={store.creator.display_name} className="h-7 w-7 rounded-full border border-white/15 object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-bold text-white/80">
              {store.creator.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white/80">{store.creator.display_name}</p>
            {store.featured && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                Verified Creator
              </span>
            )}
            {store.creator.handle && (
              <p className="text-xs text-white/35">@{store.creator.handle}</p>
            )}
          </div>
        </div>

        {err && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">
            {err}
          </div>
        )}


        {themes.length > 0 && (
          <section className="mb-3 max-w-sm md:hidden">
            <label className="block text-xs uppercase tracking-wider text-white/35 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.slug} value={opt.slug} className="bg-[#0c1326] text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </section>
        )}

        {themes.length > 0 && (
          <section className="hidden md:flex gap-2 mb-6 flex-wrap">
            {categoryOptions.map((opt) => (
              <button
                key={opt.slug}
                onClick={() => setCategory(opt.slug)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  category === opt.slug
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/60 hover:bg-white/15"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </section>
        )}

        {themes.length === 0 ? (
          <div className="text-center py-24 text-white/30">
            <p className="text-4xl mb-3">🎨</p>
            <p className="font-medium">No themes listed yet</p>
            <p className="text-sm mt-1">Check back soon.</p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredThemes.length === 0 ? (
          <div className="text-center py-24 text-white/30">
            <p className="text-4xl mb-3">🧭</p>
            <p className="font-medium">No free themes yet</p>
            <p className="text-sm mt-1">Check back soon.</p>
          </div>
        ) : (
          <div ref={resultsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredThemes.map((t) => {
              const resolved = resolvedPrices[t.id] ?? { type: "full" as const, price: t.base_price };
              return (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  resolved={resolved}
                  buying={buying === t.id}
                  onBuy={() => buyTheme(t.id)}
                  onPreview={() => setPreviewTheme(t)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Fullscreen theme preview modal */}
      {(() => {
        if (!previewTheme) return null;
        const pr = resolvedPrices[previewTheme.id] ?? { type: "full" as const, price: previewTheme.base_price };
        return (
          <ThemePreviewModal
            theme={{
              name: previewTheme.name,
              config: previewTheme.config,
              priceLabel: pr.price <= 0 ? "Free" : `$${pr.price.toFixed(2)}`,
              actionLabel:
                buying === previewTheme.id
                  ? "Processing\u2026"
                  : pr.type === "owned"
                  ? "Already Owned"
                  : pr.price <= 0
                  ? "Unlock Free"
                  : `Buy \u2014 $${pr.price.toFixed(2)}`,
              actionDisabled: pr.type === "owned" || buying === previewTheme.id,
              onAction: () => { void buyTheme(previewTheme.id); },
            }}
            onClose={() => setPreviewTheme(null)}
          />
        );
      })()}

      {checkoutTheme && (
        <ThemeCheckoutModal
          theme={checkoutTheme}
          onClose={() => setCheckoutTheme(null)}
        />
      )}
    </div>
  );
}

function ThemeCard({
  theme,
  resolved,
  buying,
  onBuy,
  onPreview,
}: {
  theme: StoreTheme;
  resolved: ResolvedPrice;
  buying: boolean;
  onBuy: () => void;
  onPreview: () => void;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cfg = theme.config;
  const bg = typeof cfg.background === "string" ? cfg.background : null;
  const backgroundMediaType =
    cfg.backgroundMediaType === "video" || typeof cfg.backgroundVideo === "string"
      ? "video"
      : "image";
  const backgroundVideo = typeof cfg.backgroundVideo === "string" ? cfg.backgroundVideo : null;
  const backgroundVideoPoster = typeof cfg.backgroundVideoPoster === "string" ? cfg.backgroundVideoPoster : null;
  const motion = typeof cfg.motion === "string" ? cfg.motion : null;
  const speed = typeof cfg.speed === "number" ? cfg.speed : 5;
  const intensity = typeof cfg.intensity === "number" ? cfg.intensity : 5;
  const motionSettings =
    cfg.motionSettings && typeof cfg.motionSettings === "object"
      ? (cfg.motionSettings as Record<string, unknown>)
      : undefined;
  const isVideoBackground = backgroundMediaType === "video" && Boolean(backgroundVideo);
  const useVideoLayer = isVideoBackground && Boolean(backgroundVideo) && !videoFailed;
  const primary = typeof cfg.primaryColor === "string" ? cfg.primaryColor : "#00ff99";
  const isHot = theme.unlock_count >= 50;

  const statusLabel =
    resolved.type === "owned"
      ? "Owned"
      : resolved.price <= 0
        ? "Free"
        : resolved.type === "upgrade"
          ? `Upgrade $${resolved.price.toFixed(2)}`
          : `Unlock $${resolved.price.toFixed(2)}`;

  const badgeClass =
    resolved.type === "owned"
      ? "text-emerald-300 bg-emerald-500/15 border-emerald-400/30"
      : resolved.type === "upgrade"
        ? "text-amber-200 bg-amber-500/15 border-amber-400/30"
        : "text-white/80 bg-white/10 border-white/15";

  const buttonLabel =
    resolved.type === "owned"
      ? "Already Owned"
      : resolved.price <= 0
        ? "View Free"
        : buying
          ? "Redirecting..."
          : "View";

  const cardPreviewBg = (backgroundVideoPoster || bg) ?? null;
  const cardBgStyle = cardPreviewBg
    ? ({ backgroundImage: `url(${cardPreviewBg})`, backgroundSize: "cover", backgroundPosition: "center" } as const)
    : ({ background: "#0a0f20" } as const);
  const animationConfig = {
    ...(cfg as Record<string, unknown>),
    background: bg ?? undefined,
    motion: motion as any,
    speed,
    intensity,
    motionSettings,
  };

  // Only play when in viewport — avoids parallel decoding of every card on the grid
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!useVideoLayer || !video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => setVideoFailed(true));
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [useVideoLayer, backgroundVideo]);

  return (
    <div ref={containerRef} className="group bg-[#111] border border-white/[0.08] rounded-2xl p-2 hover:scale-[1.02] hover:border-white/20 transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,255,200,0.18)]">
      <div className="relative h-40 rounded-xl overflow-hidden" style={cardBgStyle}>
        {!bg && !backgroundVideo && (
          <div className="absolute inset-0 z-0 bg-[#0a0f20]" />
        )}

        {useVideoLayer && backgroundVideo && (
          <video
            ref={videoRef}
            src={backgroundVideo}
            poster={backgroundVideoPoster || undefined}
            muted
            playsInline
            autoPlay
            loop
          preload="none"
            disablePictureInPicture
            className="absolute inset-0 z-10 h-full w-full object-cover"
            onLoadedData={() => setVideoFailed(false)}
            onError={() => setVideoFailed(true)}
          />
        )}

        {!useVideoLayer && (
          <div className="absolute inset-0 z-10">
            <AnimationRenderer
              config={{
                ...animationConfig,
                preserveUnderlyingMedia: false,
                background: cardPreviewBg ?? undefined,
              }}
            />
          </div>
        )}

        {/* Skip motion overlay on card thumbnails — canvas effects on every card cause lag */}

        <div className="absolute inset-0 z-20 bg-black/30" />

        <div className="absolute top-2 left-2 z-30 flex gap-1">
          {theme.is_verified && (
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] px-2 py-0.5 rounded-full">
              Verified
            </span>
          )}
          {isHot && (
            <span className="bg-orange-500/20 text-orange-300 border border-orange-400/30 text-[10px] px-2 py-0.5 rounded-full">
              Hot
            </span>
          )}
        </div>

        <div className="absolute top-2 right-2 z-30">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeClass}`}>{statusLabel}</span>
        </div>

        <div className="absolute bottom-2 left-2 z-30">
          <div className="px-3 py-1 rounded-lg text-[10px] font-semibold text-black" style={{ background: primary }}>
            Live Preview
          </div>
        </div>
      </div>

      <div className="px-1.5 pb-1 mt-2">
        <p className="text-sm font-semibold truncate">{theme.name}</p>

        {theme.category?.name && (
          <p className="text-[10px] text-white/45 mt-0.5">{theme.category.name}</p>
        )}

        <div className="flex items-end justify-between gap-3 mt-2.5">
          <div>
            {resolved.type === "upgrade" ? (
              <>
                <p className="text-xs text-emerald-300">Upgrade ${resolved.price.toFixed(2)}</p>
                <p className="text-[10px] text-white/40 line-through">${theme.base_price.toFixed(2)}</p>
              </>
            ) : resolved.price <= 0 ? (
              <p className="text-sm font-semibold text-emerald-300">Free</p>
            ) : (
              <p className="text-sm font-semibold text-white">${resolved.price.toFixed(2)}</p>
            )}
          </div>

          <button
            onClick={onPreview}
            className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 active:scale-95 transition"
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}
