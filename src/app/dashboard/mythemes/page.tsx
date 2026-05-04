"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AnimationRenderer from "@/components/theme/AnimationRenderer";
import ThemeBackgroundVideo from "@/components/theme/ThemeBackgroundVideo";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function trackThemeActivity(themeId: string, action: "preview" | "apply" | "favorite") {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return;

  await fetch("/api/themes/activity", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ theme_id: themeId, action }),
  }).catch(() => undefined);
}

type OwnedTheme = {
  id: string;
  theme_id: string | null;
  parent_theme_id: string | null;
  creator_id: string | null;
  theme_name: string | null;
  theme_config: Record<string, unknown> | null;
  unlocked_via: "promo" | "payment" | null;
  created_at: string;
  is_favorite: boolean;
  last_used_at: string | null;
  is_deleted_source: boolean | null;
};

type FilterTab = "all" | "favorites" | "recent";

function ThemeCardLivePreview({
  config,
  enabled,
}: {
  config: Record<string, unknown> | null;
  enabled: boolean;
}) {
  if (!enabled || !config) return null;

  const backgroundVideo = typeof config.backgroundVideo === "string" ? config.backgroundVideo : null;
  const backgroundVideoPoster = typeof config.backgroundVideoPoster === "string" ? config.backgroundVideoPoster : null;
  const backgroundImage = typeof config.background === "string" ? config.background : null;
  const isVideo = config.backgroundMediaType === "video" || Boolean(backgroundVideo);
  const motion = typeof config.motion === "string" ? config.motion : null;
  const speed = typeof config.speed === "number" ? config.speed : 5;
  const intensity = typeof config.intensity === "number" ? config.intensity : 5;
  const motionSettings = config.motionSettings && typeof config.motionSettings === "object"
    ? (config.motionSettings as Record<string, unknown>)
    : undefined;

  return (
    <div className="absolute inset-0 z-[1] pointer-events-none">
      {isVideo && backgroundVideo && (
        <ThemeBackgroundVideo
          src={backgroundVideo}
          poster={backgroundVideoPoster || undefined}
          motionType={motion as any}
          speed={speed}
          intensity={intensity}
          motionSettings={motionSettings as any}
          disableActiveVideoSync
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <AnimationRenderer
        config={{
          ...config,
          motion: motion as any,
          speed,
          intensity,
          motionSettings,
          preserveUnderlyingMedia: isVideo,
          background: backgroundImage ?? undefined,
        }}
      />
    </div>
  );
}

function MyThemesPageInner() {
  const [themes, setThemes] = useState<OwnedTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [searchInput, setSearchInput] = useState("");

  // Auto-dismiss success messages after 3 seconds
  useEffect(() => {
    if (msg?.kind !== "ok") return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [newlyUnlockedId, setNewlyUnlockedId] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const search = useDebounce(searchInput, 200);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => () => { setPreviewId(null); }, []);

  // Read ?theme_unlocked=<id> set by purchase flow
  useEffect(() => {
    const id = searchParams.get("theme_unlocked");
    if (id) {
      setNewlyUnlockedId(id);
      // Clean URL without re-render
      router.replace("/dashboard/mythemes", { scroll: false });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) {
          setMsg({ text: "Please log in to view your owned themes.", kind: "err" });
          setLoading(false);
          return;
        }

        const res = await fetch("/api/my-themes", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load owned themes");

        setThemes(json.themes ?? []);
      } catch (err) {
        setMsg({ text: err instanceof Error ? err.message : "Failed to load owned themes", kind: "err" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const removeTheme = async (t: OwnedTheme) => {
    if (removingId) return;
    setRemovingId(t.id);
    setConfirmRemoveId(null);
    setMsg(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/themes/unapply-user-theme", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to unapply theme");

      // Theme stays in library — just unset it as active/preview
      setActiveId(null);
      if (previewId === t.id) setPreviewId(null);
      setMsg({ text: `"${t.theme_name ?? "Theme"}" removed from your tip page.`, kind: "ok" });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to remove theme", kind: "err" });
    } finally {
      setRemovingId(null);
    }
  };

  const deleteFromLibrary = async (t: OwnedTheme) => {
    if (deletingId) return;
    setDeletingId(t.id);
    setConfirmDeleteId(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const res = await fetch("/api/my-themes/remove", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unlock_id: t.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete theme");
      setThemes((prev) => prev.filter((x) => x.id !== t.id));
      if (activeId === t.id) setActiveId(null);
      if (previewId === t.id) setPreviewId(null);
      setMsg({ text: `"${t.theme_name ?? "Theme"}" removed from your library.`, kind: "ok" });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to delete theme", kind: "err" });
    } finally {
      setDeletingId(null);
    }
  };

  const applyTheme = async (t: OwnedTheme) => {
    if (applyingId) return;
    setApplyingId(t.id);
    setActiveId(t.id);
    setPreviewId(null);
    setMsg(null);

    setThemes((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, last_used_at: new Date().toISOString() } : x))
    );

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/themes/apply-user-theme", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unlock_id: t.id }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to apply theme");

      await trackThemeActivity(t.theme_id ?? t.id, "apply");

      setMsg({ text: `"${t.theme_name ?? "Theme"}" applied.`, kind: "ok" });
    } catch (err) {
      setActiveId(null);
      setThemes((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, last_used_at: t.last_used_at } : x))
      );
      setMsg({ text: err instanceof Error ? err.message : "Failed to apply theme", kind: "err" });
    } finally {
      setApplyingId(null);
    }
  };

  // Grid tap: first tap = preview, second tap = apply.
  const handleGridTap = (t: OwnedTheme) => {
    if (previewId !== t.id) {
      setPreviewId(t.id);
      setMsg(null);
      void trackThemeActivity(t.theme_id ?? t.id, "preview");
    } else {
      applyTheme(t);
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, t: OwnedTheme) => {
    e.stopPropagation();
    const next = !t.is_favorite;
    setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_favorite: next } : x)));
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/my-themes/favorite", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unlock_id: t.id, is_favorite: next }),
      });

      if (!res.ok) {
        setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_favorite: t.is_favorite } : x)));
      } else {
        await trackThemeActivity(t.theme_id ?? t.id, "favorite");
      }
    } catch {
      setThemes((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_favorite: t.is_favorite } : x)));
    }
  };

  // Throttled scroll handler — only update state when index actually changes.
  const handleCarouselScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRafRef.current) return; // already scheduled
    const el = e.currentTarget;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (index !== carouselIndex) {
        setCarouselIndex(index);
      }
    });
  };

  // Pipeline: search → filter → sort.
  const processedThemes = useMemo(() => {
    let result = [...themes];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) => (t.theme_name ?? "").toLowerCase().includes(q));
    }

    if (filter === "favorites") result = result.filter((t) => t.is_favorite);
    if (filter === "recent") result = result.filter((t) => !!t.last_used_at);

    result.sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      if (a.last_used_at && !b.last_used_at) return -1;
      if (!a.last_used_at && b.last_used_at) return 1;
      return (
        new Date(b.last_used_at ?? b.created_at).getTime() -
        new Date(a.last_used_at ?? a.created_at).getTime()
      );
    });

    return result;
  }, [themes, search, filter]);

  // Reset carousel index when the list changes (filter/search).
  useEffect(() => {
    setCarouselIndex(0);
    if (carouselRef.current) carouselRef.current.scrollLeft = 0;
  }, [processedThemes.length, filter, search]);

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "favorites", label: "⭐ Favorites" },
    { key: "recent", label: "🕐 Recent" },
  ];

  const ThemeCard = ({
    t,
    isCenterCard,
    allowAmbientPreview,
    onTap,
  }: {
    t: OwnedTheme;
    isCenterCard: boolean;
    allowAmbientPreview: boolean;
    onTap: () => void;
  }) => {
    const isNew = newlyUnlockedId === t.theme_id || newlyUnlockedId === t.id;
    const accent =
      typeof t.theme_config?.primaryColor === "string" ? t.theme_config.primaryColor : "#22c55e";
    const backgroundMediaType =
      t.theme_config?.backgroundMediaType === "video" || typeof t.theme_config?.backgroundVideo === "string"
        ? "video"
        : "image";
    const videoPoster =
      typeof t.theme_config?.backgroundVideoPoster === "string" ? t.theme_config.backgroundVideoPoster : null;
    const imageBackground =
      typeof t.theme_config?.background === "string" ? t.theme_config.background : null;
    const bg = backgroundMediaType === "video" ? (videoPoster ?? imageBackground) : imageBackground;
    const isPreviewing = previewId === t.id;
    const isActive = activeId === t.id;
    const isApplying = applyingId === t.id;
    const showLivePreview = allowAmbientPreview || isPreviewing || isActive || isNew;
    const usedLabel = t.last_used_at
      ? new Date(t.last_used_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
      : null;
    const addedLabel = new Date(t.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

    const handlePreviewAction = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isApplying) return;
      setPreviewId(t.id);
      setMsg(null);
      void trackThemeActivity(t.theme_id ?? t.id, "preview");
    };

    const handlePrimaryAction = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isApplying) return;
      if (isActive) {
        setConfirmRemoveId(t.id);
        return;
      }
      if (isPreviewing) {
        void applyTheme(t);
        return;
      }
      setPreviewId(t.id);
      setMsg(null);
      void trackThemeActivity(t.theme_id ?? t.id, "preview");
    };

    return (
      <div
        className={[
          "group w-full overflow-hidden rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3 text-left space-y-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-all duration-200 select-none",
          isApplying ? "opacity-60" : "",
          isCenterCard ? "scale-100 opacity-100" : "scale-[0.96] opacity-55",
          isNew
            ? "border-amber-300/80 ring-1 ring-amber-300/40"
            : isPreviewing
            ? "border-sky-300/80 ring-1 ring-sky-300/40"
            : isActive
            ? "border-emerald-300/80 ring-1 ring-emerald-300/40"
            : "border-white/12 hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.04))]",
        ].join(" ")}
      >
        <div
          className="w-full h-40 rounded-[20px] relative overflow-hidden border border-white/10"
          style={
            bg
              ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)" }
          }
        >
          <ThemeCardLivePreview config={t.theme_config} enabled={showLivePreview} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/70" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />
          {backgroundMediaType === "video" && bg && (
            <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              video
            </div>
          )}
          <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {t.is_deleted_source && (
                <span className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/60 backdrop-blur-sm">
                  Archived
                </span>
              )}
            </div>
            {(isPreviewing || isActive || isNew) && (
              <div
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
                  isNew ? "bg-amber-300 text-black" : isPreviewing ? "bg-sky-400 text-slate-950" : "bg-emerald-400 text-slate-950"
                }`}
              >
                {isNew ? "New" : isPreviewing ? "Preview" : "Active"}
              </div>
            )}
          </div>
          <div className="relative z-10 flex h-full items-end p-4">
            <div className="flex w-full items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">My Library</p>
                <p className="mt-1 text-lg font-semibold text-white truncate">{t.theme_name ?? "Unlocked Theme"}</p>
              </div>
              <span
                className="shrink-0 rounded-xl px-3.5 py-2 text-[11px] font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                style={{ background: accent }}
              >
                {isApplying ? "Applying..." : isPreviewing ? "Tap again to apply" : "Tap to preview"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/42">
                <span className="inline-flex items-center gap-1">
                  <span className="text-white/28">◦</span>
                  Added {addedLabel}
                </span>
              </div>
              <p className="text-sm text-white/62 leading-relaxed">
                {usedLabel ? `Last used ${usedLabel}` : "Not used yet. Preview it once, then tap again to apply."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <div className={`rounded-full px-2.5 py-1 font-medium ${isActive ? "bg-emerald-400/12 text-emerald-300" : "bg-white/6 text-white/55"}`}>
              {isActive ? "Active now" : "Library"}
            </div>
            {!usedLabel && (
              <div className="rounded-full bg-white/6 px-2.5 py-1 text-white/45">
                Ready to apply
              </div>
            )}
          </div>

          {confirmRemoveId === t.id ? (
            <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => removeTheme(t)}
                disabled={removingId === t.id}
                className="rounded-2xl bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold px-4 py-3 transition disabled:opacity-50"
              >
                {removingId === t.id ? "Removing..." : "Yes, remove it"}
              </button>
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[12px] font-semibold px-4 py-3 transition"
              >
                Keep it on
              </button>
            </div>
          ) : confirmDeleteId === t.id ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <p className="text-[11px] text-white/50 text-center">Permanently delete from your library?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => deleteFromLibrary(t)}
                  disabled={deletingId === t.id}
                  className="rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[12px] font-semibold px-4 py-3 transition disabled:opacity-50"
                >
                  {deletingId === t.id ? "Deleting..." : "Yes, delete it"}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[12px] font-semibold px-4 py-3 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={(e) => toggleFavorite(e, t)}
                  title={t.is_favorite ? "Remove from favorites" : "Add to favorites"}
                  className={`rounded-2xl border px-3 py-3 text-[12px] font-semibold transition ${
                    t.is_favorite
                      ? "border-amber-300/40 bg-amber-300/12 text-amber-200"
                      : "border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  {t.is_favorite ? "Favorited" : "Favorite"}
                </button>
                <button
                  onClick={handlePreviewAction}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-[12px] font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/10"
                >
                  {isPreviewing ? "Previewing" : "Preview"}
                </button>
                <button
                  onClick={handlePrimaryAction}
                  className={`rounded-2xl px-3 py-3 text-[12px] font-semibold transition ${
                    isActive
                      ? "bg-red-500/85 text-white hover:bg-red-500"
                      : "text-black hover:brightness-105"
                  }`}
                  style={isActive ? undefined : { background: accent }}
                >
                  {isApplying ? "Applying..." : isActive ? "Remove" : isPreviewing ? "Apply" : "Preview to apply"}
                </button>
              </div>
              <button
                onClick={() => { setConfirmDeleteId(t.id); setConfirmRemoveId(null); }}
                className="w-full text-center text-[11px] text-white/30 hover:text-red-400/70 transition py-1"
              >
                Delete from library
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/45">Ownership</p>
          <h1 className="text-2xl font-semibold text-white mt-1">My Themes</h1>
          <p className="text-sm text-white/55 mt-1 md:hidden">Swipe to explore · tap to apply.</p>
          <p className="text-sm text-white/55 mt-1 hidden md:block">Tap to preview · tap again to apply.</p>
        </div>
        <Link
          href="/dashboard/themes"
          className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white/80 transition"
        >
          Back to Themes
        </Link>
      </div>

      {/* Search + Filter bar */}
      {!loading && themes.length > 0 && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search themes…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition"
          />
          <div className="flex gap-2 flex-wrap">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setFilter(key); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  filter === key
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/60 hover:bg-white/15"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-white/35 self-center">
              {processedThemes.length} / {themes.length}
            </span>
          </div>
        </div>
      )}

      {/* Newly unlocked banner */}
      {newlyUnlockedId && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-300">
            <span>🎨</span>
            <span>Theme unlocked! Tap it below to apply it to your tip page.</span>
          </div>
          <button
            onClick={() => setNewlyUnlockedId(null)}
            className="text-amber-400/60 hover:text-amber-300 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Status message */}
      {msg && (
        <div
          className={`text-sm rounded-xl border px-3 py-2 ${
            msg.kind === "ok"
              ? "border-green-500/30 bg-green-500/10 text-green-300"
              : "border-white/15 bg-white/5 text-white/80"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="h-4 w-4 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          Loading owned themes…
        </div>
      ) : themes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/55">
          No themes purchased yet.
        </div>
      ) : processedThemes.length === 0 ? (
        <div className="text-center text-white/40 py-16 text-sm">No themes found.</div>
      ) : (
        <>
          {/* ── MOBILE: swipe carousel ── */}
          <div className="md:hidden space-y-3">
            <div
              ref={carouselRef}
              className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={handleCarouselScroll}
            >
              {processedThemes.map((t, i) => (
                <div key={t.id} className="min-w-full snap-center px-2">
                  <ThemeCard
                    t={t}
                    isCenterCard={i === carouselIndex}
                    allowAmbientPreview={i === carouselIndex}
                    onTap={() => {
                      if (i === carouselIndex) {
                        // Already focused → apply immediately (swipe already = preview).
                        applyTheme(t);
                      } else {
                        // Scroll to this slide.
                        carouselRef.current?.scrollTo({
                          left: i * (carouselRef.current.clientWidth),
                          behavior: "smooth",
                        });
                      }
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Dot indicators */}
            {processedThemes.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {processedThemes.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Go to theme ${i + 1}`}
                    onClick={() => {
                      carouselRef.current?.scrollTo({
                        left: i * (carouselRef.current.clientWidth),
                        behavior: "smooth",
                      });
                    }}
                    className={`rounded-full transition-all duration-200 ${
                      i === carouselIndex ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/30"
                    }`}
                  />
                ))}
              </div>
            )}
            <p className="text-xs text-white/35 text-center">
              {carouselIndex + 1} / {processedThemes.length} · swipe to explore · tap to apply
            </p>
          </div>

          {/* ── DESKTOP: grid ── */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3">
            {processedThemes.map((t) => (
              <ThemeCard
                key={t.id}
                t={t}
                isCenterCard={true}
                allowAmbientPreview={false}
                onTap={() => handleGridTap(t)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MyThemesPage() {
  return (
    <Suspense fallback={null}>
      <MyThemesPageInner />
    </Suspense>
  );
}
