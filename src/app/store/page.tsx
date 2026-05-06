"use client";

import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import AnimationRenderer from "@/components/theme/AnimationRenderer";
import StoreMobileMenu from "@/components/StoreMobileMenu";
import ThemePreviewModal from "@/components/store/ThemePreviewModal";
import ThemeCheckoutModal from "@/components/store/ThemeCheckoutModal";
import { supabase } from "@/lib/supabase/client";
import { CURATED_THEME_CATEGORIES } from "@/lib/themeCategories";

type TopTab = "free" | "recommended" | "stores";

type ThemeItem = {
  id: string;
  name: string;
  base_price: number;
  upgrade_price: number | null;
  unlock_count: number;
  created_at: string | null;
  is_verified: boolean;
  config: Record<string, unknown>;
  category: {
    name: string | null;
    slug: string | null;
  } | null;
  store: {
    name: string;
    slug: string;
    featured: boolean;
    total_sales: number;
  };
};

type FeaturedCreator = {
  slug: string;
  name: string;
  totalSales: number;
};

type CreatorStore = {
  slug: string;
  name: string;
  totalSales: number;
  followers?: number;
  featured: boolean;
  category: string | null;
  themeCount: number;
  previewConfig: Record<string, unknown> | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
};

type ApiCreatorStore = {
  slug: string;
  store_name: string | null;
  featured: boolean | null;
  category: string | null;
  theme_count?: number;
  preview_theme_config?: Record<string, unknown> | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  total_sales?: number;
  followers?: number;
};

type StoreFeedResponse = {
  themes: ThemeItem[];
  categories: string[];
  featuredCreators: FeaturedCreator[];
  creatorStores?: ApiCreatorStore[];
};

const CATEGORY_FALLBACK = CURATED_THEME_CATEGORIES.map((c) => c.slug);

type StoreHeroAd = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  ctaLabel: string;
  ctaHref: string;
  ctaExternal?: boolean;
  accent: string;
  motion: "particlesSoft" | "moneyRain" | "heartbeat";
  overlay: "smoke" | "sparkle" | "dust";
  lighting: "glow" | null;
  imageUrl?: string | null;
};

const FALLBACK_HERO_ADS: StoreHeroAd[] = [
  {
    id: "midnight-drop",
    title: "Midnight Luxe Drop",
    subtitle: "A cinematic premium set lands this Friday. Get first access before public release.",
    badge: "Upcoming",
    ctaLabel: "Preview Drop",
    ctaHref: "/store?tab=recommended",
    accent: "#22d3ee",
    motion: "particlesSoft",
    overlay: "smoke",
    lighting: "glow",
  },
  {
    id: "creator-week",
    title: "Creator Week Spotlight",
    subtitle: "Limited-time featured themes from top sellers. Fresh visuals rotating daily.",
    badge: "Featured",
    ctaLabel: "Browse Spotlights",
    ctaHref: "/store?tab=stores",
    accent: "#f59e0b",
    motion: "moneyRain",
    overlay: "sparkle",
    lighting: "glow",
  },
  {
    id: "launch-alert",
    title: "Next Release Alert",
    subtitle: "Tap in early for upcoming animated themes and launch-only pricing windows.",
    badge: "Ad",
    ctaLabel: "Join Launch Wave",
    ctaHref: "/dashboard/mythemes",
    accent: "#4ade80",
    motion: "heartbeat",
    overlay: "dust",
    lighting: "glow",
  },
];

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function StorePageContent() {
  const searchParams = useSearchParams();
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [featuredCreators, setFeaturedCreators] = useState<FeaturedCreator[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [apiCreatorStores, setApiCreatorStores] = useState<ApiCreatorStore[]>([]);
  const [activeTab, setActiveTab] = useState<TopTab>(() => {
    const t = searchParams.get("tab");
    if (t === "free" || t === "recommended" || t === "stores") return t;
    return "recommended";
  });
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeItem | null>(null);
  const [authed, setAuthed] = useState(false);
  const [checkoutTheme, setCheckoutTheme] = useState<{ id: string; name: string; price: number } | null>(null);
  const [heroAds, setHeroAds] = useState<StoreHeroAd[]>(FALLBACK_HERO_ADS);

  useEffect(() => {
    void fetchHeroAds();
  }, []);

  async function fetchHeroAds() {
    try {
      const res = await fetch("/api/store/hero-ads", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { ads?: StoreHeroAd[] };
      if (json.ads && json.ads.length > 0) {
        setHeroAds(json.ads);
      }
    } catch {
      // Keep fallback hero ads when API is unavailable.
    }
  }

  async function buyTheme(themeId: string) {
    const theme = themes.find((t) => t.id === themeId);
    const price = Number(theme?.base_price ?? 1);

    const token = await getToken();
    if (!token) {
      window.location.href = `/login?next=/store`;
      return;
    }
    setSelectedTheme(null);
    setCheckoutTheme({ id: themeId, name: theme?.name ?? "Theme", price });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session?.user));
    });
  }, []);

  useEffect(() => {
    void fetchFeed();
  }, [activeTab]);

  async function fetchFeed() {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const params = new URLSearchParams({ tab: activeTab, category, search });
      const res = await fetch(`/api/store?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });

      const json = (await res.json()) as StoreFeedResponse | { error?: string };
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? "Failed to load store");
      }

      const payload = json as StoreFeedResponse;
      setThemes(payload.themes ?? []);
      setFeaturedCreators(payload.featuredCreators ?? []);
      setCategories((payload.categories && payload.categories.length > 0) ? payload.categories : CATEGORY_FALLBACK);
      setApiCreatorStores(payload.creatorStores ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const filteredThemes = useMemo(() => {
    let result = [...themes];

    if (category !== "all") {
      result = result.filter((t) => (t.category?.slug ?? "") === category);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        return (
          t.name.toLowerCase().includes(q) ||
          t.store.name.toLowerCase().includes(q) ||
          (t.category?.name ?? "").toLowerCase().includes(q)
        );
      });
    }

    return result.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [themes, category, search]);

  const creatorStores = useMemo(() => {
    // Use the dedicated API list when available (populated on stores tab),
    // otherwise fall back to deriving stores from loaded themes.
    const base: CreatorStore[] =
      apiCreatorStores.length > 0
        ? apiCreatorStores.map((s) => ({
            slug: s.slug,
            name: s.store_name ?? s.slug,
            totalSales: s.total_sales ?? 0,
            featured: s.featured === true,            followers: s.followers ?? 0,
            category: s.category ?? null,
            themeCount: s.theme_count ?? 0,
            avatarUrl: s.avatar_url ?? null,
            bannerUrl: s.banner_url ?? null,
            previewConfig: s.preview_theme_config ?? null,          }))
        : (() => {
            const map = new Map<string, CreatorStore>();
            const nulls = { category: null, themeCount: 0, previewConfig: null, avatarUrl: null, bannerUrl: null };
            for (const theme of themes) {
              if (!map.has(theme.store.slug)) {
                map.set(theme.store.slug, {
                  slug: theme.store.slug,
                  name: theme.store.name,
                  totalSales: theme.store.total_sales,
                  featured: theme.store.featured,
                  ...nulls,
                });
              }
            }
            for (const creator of featuredCreators) {
              if (!map.has(creator.slug)) {
                map.set(creator.slug, {
                  slug: creator.slug,
                  name: creator.name,
                  totalSales: creator.totalSales,
                  featured: true,
                  ...nulls,
                });
              }
            }
            return Array.from(map.values());
          })();

    // Strip any stores that have no slug or no name — they'd 404 if linked
    const valid = base.filter((s) => Boolean(s.slug) && Boolean(s.name));

    const q = search.trim().toLowerCase();
    const searched = q
      ? valid.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
      : valid;

    return searched.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return 0;
    });
  }, [apiCreatorStores, themes, featuredCreators, search]);

  const recommendedThemes = useMemo(() => filteredThemes.slice(0, 10), [filteredThemes]);

  return (
    <div className="min-h-screen bg-[#060D1F] text-white pb-20">
      {/* Desktop navbar */}
      <header className="fixed top-0 left-0 right-0 z-40 hidden md:flex items-center justify-between border-b border-white/8 bg-[#060D1F]/90 backdrop-blur-md px-6 h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-bold tracking-tight text-white hover:text-white/80 transition">
            1neLink
          </Link>
          <span className="text-xs text-white/30">Theme Store</span>
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

      <div className="mx-auto max-w-6xl px-4 pt-8 md:pt-24">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <StoreMobileMenu />
          <Link href="/" className="text-xs text-white/50 hover:text-white/80 transition">1neLink</Link>
        </div>

        <Hero ads={heroAds} />

        <Tabs activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); }} />

        <>
            {activeTab !== "stores" && (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {["all", ...categories].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${
                      category === cat
                        ? "bg-white text-black"
                        : "bg-white/10 text-white/65 hover:bg-white/15"
                    }`}
                  >
                    {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            )}

            <SearchBar
              search={search}
              setSearch={setSearch}
              placeholder={activeTab === "stores" ? "Search creator stores..." : "Search themes, creators..."}
            />

            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-40 bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : activeTab === "stores" ? (
              <Section title="Creator Stores">
                <CreatorStoreGrid stores={creatorStores} />
              </Section>
            ) : (
              <>
                <Section title="Recommended">
                  <ThemeRow themes={recommendedThemes} onPreview={setSelectedTheme} />
                </Section>

                <FeaturedCreators creators={featuredCreators} />

                <Section title="All Themes">
                  <ThemeGrid themes={filteredThemes} onPreview={setSelectedTheme} />
                </Section>
              </>
            )}
        </>
      </div>

      {selectedTheme && (
        <ThemePreviewModal
          theme={{
            name: selectedTheme.name,
            config: selectedTheme.config,
            priceLabel: selectedTheme.base_price <= 0 ? "Free" : `$${selectedTheme.base_price.toFixed(2)}`,
            actionLabel: selectedTheme.base_price <= 0 ? "Claim Free" : `Buy — $${selectedTheme.base_price.toFixed(2)}`,
            onAction: () => { void buyTheme(selectedTheme.id); },
          }}
          onClose={() => { setSelectedTheme(null); }}
        />
      )}

      {checkoutTheme && (
        <ThemeCheckoutModal
          theme={checkoutTheme}
          onClose={() => setCheckoutTheme(null)}
        />
      )}
    </div>
  );
}

export default function StorePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050A1A]" />}>
      <StorePageContent />
    </Suspense>
  );
}




function Hero({ ads }: { ads: StoreHeroAd[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const currentAd = ads[index] ?? ads[0];

  useEffect(() => {
    if (paused || ads.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ads.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [paused, ads.length]);

  useEffect(() => {
    if (index >= ads.length) {
      setIndex(0);
    }
  }, [ads.length, index]);

  if (!currentAd) return null;

  return (
    <div
      className="relative h-56 rounded-2xl overflow-hidden mb-6 border border-white/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slow-zoom backdrop */}
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={currentAd.id}
          className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#060D1F] to-[#000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: [1.0, 1.08, 1.0] }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.55, ease: "easeOut" }, scale: { duration: 12, repeat: Infinity, ease: "easeInOut" } }}
        >
          {currentAd.imageUrl && (
            <img
              src={currentAd.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              referrerPolicy="no-referrer"
            />
          )}
        </motion.div>
      </AnimatePresence>
      <AnimationRenderer
        config={{
          background: currentAd.imageUrl ?? undefined,
          motion: currentAd.motion,
          overlay: currentAd.overlay,
          lighting: currentAd.lighting,
          speed: 5,
          intensity: 5,
        }}
      />
      <div className="absolute inset-0 bg-black/55" />

      <motion.div
        key={currentAd.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-10 p-5 h-full flex flex-col justify-between"
      >
        <div>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ background: `${currentAd.accent}22`, color: currentAd.accent }}
          >
            {currentAd.badge}
          </span>
          <h1 className="text-xl md:text-2xl font-bold mt-2">{currentAd.title}</h1>
          <p className="text-sm text-white/70 mt-1 max-w-xl">{currentAd.subtitle}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link
            href={currentAd.ctaHref}
            target={currentAd.ctaExternal ? "_blank" : undefined}
            rel={currentAd.ctaExternal ? "noopener noreferrer" : undefined}
            className="inline-flex items-center rounded-xl bg-white text-black px-4 py-2 text-xs font-semibold hover:bg-white/90 transition"
          >
            {currentAd.ctaLabel}
          </Link>

          <div className="flex items-center gap-1.5">
            {ads.map((ad, i) => (
              <button
                key={ad.id}
                type="button"
                aria-label={`Show ${ad.title}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-2 bg-white/40 hover:bg-white/60"}`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Tabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: TopTab;
  setActiveTab: (tab: TopTab) => void;
}) {
  const tabs: Array<{ id: TopTab; label: string }> = [
    { id: "recommended", label: "Recommended" },
    { id: "free", label: "Free" },
    { id: "stores", label: "Stores" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
            activeTab === tab.id
              ? "bg-white text-black"
              : "bg-white/10 text-white/60 hover:bg-white/15"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SearchBar({
  search,
  setSearch,
  placeholder,
}: {
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2 mb-6 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/40"
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}

function ThemeRow({ themes, onPreview }: { themes: ThemeItem[]; onPreview: (t: ThemeItem) => void }) {
  if (themes.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {themes.map((theme) => (
        <div key={theme.id} className="min-w-[200px] max-w-[200px]">
          <ThemeCard theme={theme} onPreview={onPreview} />
        </div>
      ))}
    </div>
  );
}

function ThemeGrid({ themes, onPreview }: { themes: ThemeItem[]; onPreview: (t: ThemeItem) => void }) {
  if (themes.length === 0) {
    return <div className="text-sm text-white/45 py-6">No themes found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {themes.map((theme) => (
        <ThemeCard key={theme.id} theme={theme} onPreview={onPreview} />
      ))}
    </div>
  );
}

function ThemeMediaPreview({
  config,
  overlayClassName = "bg-black/35",
  showMotionOverlay = false,
}: {
  config: Record<string, unknown> | null | undefined;
  overlayClassName?: string;
  /** Render the motion/animation overlay. Skip for grid thumbnails to save GPU. */
  showMotionOverlay?: boolean;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cfg = config && typeof config === "object" ? config : {};
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
  const previewBg = (backgroundVideoPoster || bg) ?? null;
  const previewStyle = previewBg
    ? ({ backgroundImage: `url(${previewBg})`, backgroundSize: "cover", backgroundPosition: "center" } as const)
    : ({ background: "#0a0f20" } as const);
  const animationConfig = {
    ...(cfg as Record<string, unknown>),
    background: bg ?? undefined,
    motion: motion as any,
    speed,
    intensity,
    motionSettings,
  };

  // Only play when the card is visible in the viewport to avoid parallel decoding of all videos
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
    <div ref={containerRef} className="absolute inset-0" style={previewStyle}>
      {!bg && !backgroundVideo && <div className="absolute inset-0 z-0 bg-[#0a0f20]" />}

      {useVideoLayer && backgroundVideo && (
        <video
          ref={videoRef}
          src={backgroundVideo}
          poster={backgroundVideoPoster || undefined}
          muted
          playsInline
          loop
          preload="none"
          disablePictureInPicture
          className="absolute inset-0 z-10 h-full w-full object-cover"
          onError={() => setVideoFailed(true)}
        />
      )}

      {!useVideoLayer && (
        <div className="absolute inset-0 z-10">
          <AnimationRenderer
            config={{
              ...animationConfig,
              preserveUnderlyingMedia: false,
              background: previewBg ?? undefined,
            }}
          />
        </div>
      )}

      {useVideoLayer && showMotionOverlay && (
        <div className="absolute inset-0 z-20">
          <AnimationRenderer
            config={{
              ...animationConfig,
              preserveUnderlyingMedia: true,
            }}
          />
        </div>
      )}

      <div className={`absolute inset-0 z-30 ${overlayClassName}`} />
    </div>
  );
}

function ThemeCard({ theme, onPreview }: { theme: ThemeItem; onPreview: (t: ThemeItem) => void }) {
  return (
    <div
      className="bg-[#111] rounded-2xl p-2 border border-white/10 group transition hover:scale-[1.02] hover:shadow-[0_0_16px_rgba(0,255,200,0.12)] cursor-pointer active:scale-95"
      onClick={() => onPreview(theme)}
    >
      <div className="relative h-32 rounded-xl overflow-hidden">
        <ThemeMediaPreview config={theme.config} />

        <div className="absolute top-2 left-2 flex gap-1">
          {theme.is_verified && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
              Verified
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 px-1">
        <p className="text-sm font-semibold truncate">{theme.name}</p>
        {theme.category?.name && <p className="text-[10px] text-white/40 mt-0.5">{theme.category.name}</p>}

        <div className="flex items-center justify-between mt-2">
          <p className="text-sm font-semibold">
            {theme.base_price <= 0 ? "Free" : `$${theme.base_price.toFixed(2)}`}
          </p>

          <button
            onClick={(e) => { e.stopPropagation(); onPreview(theme); }}
            className="bg-white text-black px-3 py-1 rounded-lg text-xs font-medium hover:bg-white/90 transition"
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}

function FeaturedCreators({ creators }: { creators: FeaturedCreator[] }) {
  if (creators.length === 0) return null;

  return (
    <Section title="Featured Creators">
      <div className="flex gap-3 overflow-x-auto">
        {creators.map((creator) => (
          <Link
            key={creator.slug}
            href={`/store/${creator.slug}`}
            className="bg-[#111] p-3 rounded-xl min-w-[160px] border border-white/10 hover:border-white/20 transition"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full mb-2 flex items-center justify-center text-sm font-bold">
              {(creator.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <p className="text-sm font-semibold truncate">{creator.name}</p>
            <p className="text-xs text-white/50">{creator.totalSales} sales</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function CreatorStoreGrid({ stores }: { stores: CreatorStore[] }) {
  if (stores.length === 0) {
    return <div className="text-sm text-white/45 py-6">No creator stores found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {stores.map((store) => (
        <Link
          key={store.slug}
          href={`/store/${store.slug}`}
          className="bg-[#111] rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 active:scale-95 transition-all group"
        >
          {/* Store picture (avatar) — main visual */}
          <div className="relative h-36 overflow-hidden bg-white/5">
            {store.avatarUrl ? (
              <img
                src={store.avatarUrl}
                alt={store.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : store.bannerUrl ? (
              <img
                src={store.bannerUrl}
                alt={store.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : store.previewConfig ? (
              <ThemeMediaPreview config={store.previewConfig} overlayClassName="bg-black/20" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-bold text-white/20 select-none">
                  {(store.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {store.featured && (
              <span className="absolute top-2 right-2 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
                Featured
              </span>
            )}
          </div>

          {/* Info */}
          <div className="px-3 pt-2.5 pb-3">
            <p className="text-sm font-semibold truncate">{store.name}</p>
            <p className="text-[11px] text-white/40 mt-0.5">
              {store.themeCount > 0 ? `${store.themeCount} themes` : ""}
              {store.themeCount > 0 && store.category ? " · " : ""}
              {store.category ? <span className="capitalize">{store.category}</span> : null}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

