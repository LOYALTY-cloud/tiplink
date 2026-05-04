"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";
import { THEME_KEYS, isThemeUnlocked, THEME_PRICE_LABEL, BUNDLE_PRICE_LABEL, ARMY_PACK_PRICE_LABEL, IMHER_PACK_PRICE_LABEL } from "@/lib/themes";
import { getTheme } from "@/lib/getTheme";
import { THEME_META } from "@/lib/themeMeta";
import ThemeCheckoutModal from "@/components/store/ThemeCheckoutModal";
import { showGlobalToast } from "@/components/GlobalToast";

/* --------------- THEME LABELS + ANALYTICS --------------- */

const THEME_LABELS: Record<string, { name: string; label: string; boost?: number; animated?: boolean }> = {
  default: { name: "Default", label: "💼 Professional Trust", boost: 0 },
  dark:    { name: "Dark Pro", label: "🖤 Sleek & Minimal", boost: 12 },
  aurora:  { name: "Aurora", label: "🎨 Premium Fintech", boost: 18, animated: true },
  gradient:{ name: "Gradient", label: "🌈 Bold & Fresh", boost: 22, animated: true },
  violet:  { name: "Violet", label: "💎 Trust Glass", boost: 15 },
  bold:    { name: "Bold", label: "🔥 High Visibility", boost: 10 },
  army_black: { name: "Army — Black", label: "⚫ Tactical Pro", boost: 16, animated: true },
  army_pink:  { name: "Army — Pink", label: "🌸 Creator Mode", boost: 20, animated: true },
  army_red:   { name: "Army — Red", label: "🔴 High Conversion", boost: 24, animated: true },
  pink_luxe:  { name: "Pink Luxe", label: "💖 Soft Glow", boost: 22 },
  ice_blue:   { name: "Ice Blue", label: "🧊 Clean Aesthetic", boost: 18 },
  lavender:   { name: "Lavender Glass", label: "💜 Premium Soft", boost: 20 },
  peach:      { name: "Peach Glow", label: "🍑 Warm & Friendly", boost: 17 },
  glitter:    { name: "Glitter Dark", label: "✨ VIP Sparkle", boost: 25, animated: true },
};

/* --------------- PACK CONFIG --------------- */

const THEME_PACKS: Record<string, { name: string; themes: string[]; price: string; label: string }> = {
  imher: {
    name: "💖 I'm Her Pack",
    themes: ["pink_luxe", "ice_blue", "lavender", "peach", "glitter"],
    price: IMHER_PACK_PRICE_LABEL,
    label: "Most popular with female creators",
  },
  hustle: {
    name: "🔥 Hustle Pack",
    themes: ["army_black", "army_red", "army_pink"],
    price: ARMY_PACK_PRICE_LABEL,
    label: "High energy / street vibe",
  },
};

/* --------------- LIVE PREVIEW COMPONENT --------------- */

function TipPagePreview({ handle, themeKey, accentOverride }: { handle: string; themeKey: string; accentOverride?: string }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const t = getTheme(themeKey);

  return (
    <div className={`p-5 flex flex-col items-center h-full ${t.text}`}>
      {/* Profile */}
      <div className="mt-4 text-center">
        <div className="w-16 h-16 rounded-full bg-white/20 mx-auto mb-3" />
        <div className="font-semibold text-lg">Your Name</div>
        <div className="text-sm opacity-60">@{handle}</div>
        <div className="text-xs opacity-40 mt-1">Hustle all day</div>
      </div>

      {/* Tip Card */}
      <div className={`mt-6 w-full rounded-2xl p-4 border ${t.card}`}>
        <div className="text-sm mb-3 font-medium">Tip Jar</div>

        <div className="flex gap-2 mb-3">
          {[5, 10, 20].map((v) => (
            <button
              key={v}
              onClick={() => { setAmount(v); setCustom(""); }}
              className={`flex-1 py-2 rounded-lg text-sm transition ${
                amount === v ? t.button : `${t.inputBg} opacity-80`
              }`}
              style={amount === v && accentOverride ? { backgroundColor: accentOverride, color: "#fff" } : undefined}
            >
              ${v}
            </button>
          ))}
        </div>

        <input
          value={custom}
          onChange={(e) => { setCustom(e.target.value); setAmount(Number(e.target.value) || null); }}
          placeholder="Custom amount"
          className={`w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none ${t.inputBg}`}
        />

        <textarea
          placeholder="Say something nice..."
          className={`w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none resize-none ${t.inputBg}`}
          rows={2}
        />

        <button
          className={`w-full py-2.5 rounded-xl font-medium transition ${accentOverride ? "" : `${t.button} ${t.glow}`}`}
          style={accentOverride ? { backgroundColor: accentOverride, color: "#fff" } : undefined}
        >
          Pay {amount ? `$${amount}` : ""}
        </button>
      </div>
    </div>
  );
}

/* --------------- MAIN PAGE --------------- */

function ThemesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [handle, setHandle] = useState<string>("yourname");

  const [profileTheme, setProfileTheme] = useState<string>("default");
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>([]);
  const [themePurchasing, setThemePurchasing] = useState(false);
  const [modalTheme, setModalTheme] = useState<string | null>(null);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [customAccent, setCustomAccent] = useState("#22c55e");
  const [customBg, setCustomBg] = useState("#0b0f1a");
  const [editorOpen, setEditorOpen] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);
  const [pinkFlash, setPinkFlash] = useState(false);
  const [blackFlash, setBlackFlash] = useState(false);
  const [openPack, setOpenPack] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [animationsOff, setAnimationsOff] = useState(false);

  const selectTheme = (t: string) => {
    setPreviewTheme(t);
    if (t === "army_pink") {
      setPinkFlash(true);
      setTimeout(() => setPinkFlash(false), 150);
    }
    if (t === "army_black") {
      setBlackFlash(true);
      setTimeout(() => setBlackFlash(false), 150);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, theme")
        .eq("user_id", userRes.user.id)
        .maybeSingle();

      if ((prof as { handle?: string } | null)?.handle) setHandle((prof as { handle: string }).handle);
      const saved = (prof as { theme?: string } | null)?.theme || "default";
      setProfileTheme(saved);
      setPreviewTheme(saved);
      setLoading(false);

      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          const [themesRes, balanceRes] = await Promise.all([
            fetch("/api/themes/list", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          const themesJson = await themesRes.json();
          setUnlockedThemes(themesJson.unlocked ?? []);
          const balanceJson = await balanceRes.json();
          setWalletBalance(balanceJson.balance ?? 0);
        }
      } catch {
        showGlobalToast("Failed to load themes");
      }
    })();
  }, [router]);

  // Handle theme purchase success redirect
  useEffect(() => {
    if (searchParams.get("theme_success") === "true") {
      setThemeMsg(null); // Clear any existing message
      
      (async () => {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          if (token) {
            const res = await fetch("/api/themes/list", { headers: { Authorization: `Bearer ${token}` } });
            const json = await res.json();
            setUnlockedThemes(json.unlocked ?? []);

            // Auto-apply the newly purchased theme
            const purchasedTheme = searchParams.get("theme");
            if (purchasedTheme) {
              await fetch("/api/profile/theme", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ theme: purchasedTheme }),
              });
              setProfileTheme(purchasedTheme);
              setPreviewTheme(purchasedTheme);
            }
          }
        } catch {
          showGlobalToast("Failed to apply purchased theme");
        }
      })();

      // Show unlock celebration with delay for dramatic effect
      setTimeout(() => setThemeMsg("🎉 Theme Unlocked & Applied!"), 300);
      setTimeout(() => setThemeMsg(null), 5000);
      router.replace("/dashboard/themes", { scroll: false });
    }
   
  }, []);

  const activePreview = previewTheme ?? profileTheme;
  const previewBg = getTheme(activePreview);
  const activeInfo = THEME_LABELS[activePreview];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-6">

      {/* --------------- LEFT PANEL --------------- */}
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Choose your theme</h1>
          <p className="text-xs text-white/50 mt-1">This is how people see your tip page</p>
          <Link
            href="/dashboard/mythemes"
            className="inline-block mt-2 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-white/80 transition"
          >
            My Themes
          </Link>
        </div>

        {/* Theme list — Base themes */}
        <div className="grid gap-2">
          {THEME_KEYS.filter((t) => !Object.values(THEME_PACKS).some((p) => p.themes.includes(t))).map((t) => {
            const isActive = profileTheme === t;
            const isPreview = activePreview === t;
            const unlocked = isThemeUnlocked(t, unlockedThemes);
            const meta = THEME_META[t];
            const info = THEME_LABELS[t] ?? { name: t, label: "" };

            return (
              <div key={t} className="relative">
                {meta?.badge && (
                  <span className="absolute -top-1.5 -right-1.5 z-10 text-[10px] font-bold bg-yellow-400 text-black px-2 py-0.5 rounded-full shadow">
                    {meta.badge}
                  </span>
                )}
                <button
                  disabled={themePurchasing}
                  onClick={() => { selectTheme(t); setSelectedPack(null); }}
                  className={`rounded-xl border p-3 text-left transition w-full ${
                    isPreview
                      ? "border-blue-400 bg-blue-500/10"
                      : "border-white/[0.12] hover:bg-white/5"
                  } ${themePurchasing ? "opacity-50 cursor-wait" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-white">
                      {info.name}{!unlocked && " 🔒"}
                    </div>
                    <div className="flex items-center gap-2">
                      {info.animated && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-medium">✦ Animated</span>
                      )}
                      {isActive && (
                        <span className="text-[10px] text-emerald-400 font-medium">Active</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">{info.label}</div>
                  {info.boost ? (
                    <div className="text-[10px] mt-1 text-emerald-400 font-medium">
                      ↑ {info.boost}% more tips
                    </div>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>

        {/* Theme Packs — Dropdown system */}
        {Object.entries(THEME_PACKS).map(([key, pack]) => {
          const isOpen = openPack === key;
          const allUnlocked = pack.themes.every((t) => isThemeUnlocked(t, unlockedThemes));

          return (
            <div key={key} className="rounded-xl border border-white/[0.12] overflow-hidden">
              <button
                onClick={() => { setOpenPack(isOpen ? null : key); setSelectedPack(key); }}
                className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition"
              >
                <div>
                  <div className="text-sm font-medium text-white">{pack.name}</div>
                  <div className="text-[11px] text-white/55">{pack.label}</div>
                </div>
                <div className="flex items-center gap-2">
                  {allUnlocked && <span className="text-[10px] text-emerald-400">✓</span>}
                  <span className="text-white/55 text-xs">{isOpen ? "▾" : "▸"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="p-2 space-y-1.5">
                  {pack.themes.map((t) => {
                    const unlocked = isThemeUnlocked(t, unlockedThemes);
                    const isPreview = activePreview === t;
                    const isActive = profileTheme === t;
                    const info = THEME_LABELS[t] ?? { name: t, label: "" };

                    return (
                      <button
                        key={t}
                        disabled={themePurchasing}
                        onClick={() => { selectTheme(t); setSelectedPack(key); }}
                        className={`w-full text-left p-2.5 rounded-lg text-sm transition ${
                          isPreview
                            ? "bg-blue-500/10 border border-blue-400"
                            : "hover:bg-white/5 border border-transparent"
                        } ${themePurchasing ? "opacity-50 cursor-wait" : ""}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-white">
                            {info.name}{!unlocked && " 🔒"}
                            {isActive && <span className="ml-1.5 text-[10px] text-emerald-400">Active</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {info.animated && (
                              <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-medium">✦</span>
                            )}
                            {info.boost ? (
                              <span className="text-[10px] text-emerald-400">↑ {info.boost}%</span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!allUnlocked && (
                    <button
                      disabled={themePurchasing}
                      onClick={() => setModalTheme(key === "hustle" ? "army_pack" : "imher_pack")}
                      className={`w-full mt-1 border text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-50 ${
                        key === "hustle"
                          ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                          : "border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20"
                      }`}
                    >
                      🔓 Unlock {pack.name} — {pack.price}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Animation toggle */}
        <button
          onClick={() => setAnimationsOff((v) => !v)}
          className="w-full flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 transition"
        >
          <span>✦ Animations</span>
          <span className={`inline-block w-8 h-4 rounded-full relative transition-colors ${
            animationsOff ? "bg-white/20" : "bg-emerald-500/60"
          }`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
              animationsOff ? "left-0.5" : "left-[18px]"
            }`} />
          </span>
        </button>

        {/* Theme Editor */}
        <button
          onClick={() => setEditorOpen((o) => !o)}
          className="w-full text-left text-xs text-white/50 hover:text-white/70 transition flex items-center gap-2 py-1"
        >
          <span className="text-[10px]">{editorOpen ? "▾" : "▸"}</span>
          🎨 Theme Editor
        </button>

        {editorOpen && (
          <div className="rounded-xl border border-white/[0.12] bg-white/5 p-4 space-y-3">
            <div>
              <label className="text-xs text-white/60">Accent Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={customAccent}
                  onChange={(e) => setCustomAccent(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                />
                <span className="text-xs text-white/55 font-mono">{customAccent}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60">Background</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={customBg}
                  onChange={(e) => setCustomBg(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                />
                <span className="text-xs text-white/55 font-mono">{customBg}</span>
              </div>
            </div>
            <p className="text-[10px] text-white/45">
              Colors apply to the live preview. Choose a theme first, then fine-tune.
            </p>
          </div>
        )}

        {/* Unlock All bundle */}
        {!unlockedThemes.includes("all") && (
          <button
            disabled={themePurchasing}
            onClick={() => setModalTheme("all")}
            className="w-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm font-medium py-2.5 rounded-lg hover:bg-yellow-500/20 transition disabled:opacity-50"
          >
            🔓 Unlock All — {BUNDLE_PRICE_LABEL}
            {walletBalance >= 4.99 && (
              <span className="ml-1 text-[10px] text-emerald-300">✓ Balance covers this</span>
            )}
          </button>
        )}

        <p className="text-xs text-white/45 text-center">
          Free: default, dark · Premium: {THEME_PRICE_LABEL} each
        </p>

        {/* Apply button */}
        <button
          disabled={themeSaving || activePreview === profileTheme || !isThemeUnlocked(activePreview, unlockedThemes)}
          onClick={async () => {
            setThemeSaving(true);
            try {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              const res = await fetch("/api/profile/theme", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ theme: activePreview }),
              });
              if (!res.ok) throw new Error((await res.json()).error);
              setProfileTheme(activePreview);
              setThemeMsg("Theme saved ✔");
              setTimeout(() => setThemeMsg(null), 2000);
            } catch (e: unknown) {
              setThemeMsg(e instanceof Error ? e.message : "Failed to save theme");
            } finally {
              setThemeSaving(false);
            }
          }}
          className={`w-full text-sm font-medium py-2.5 rounded-xl transition disabled:opacity-40 active:scale-[0.98] ${
            themeSaving || activePreview === profileTheme || !isThemeUnlocked(activePreview, unlockedThemes)
              ? "bg-blue-600/50 text-white/50"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
          }`}
        >
          {!isThemeUnlocked(activePreview, unlockedThemes)
            ? "Unlock to Apply"
            : themeSaving
            ? "Saving…"
            : "Apply Theme"}
        </button>

        {themeMsg && (
          <div className="fixed inset-x-0 top-6 z-50 flex justify-center animate-[celebratePop_0.5s_ease]">
            <div className="bg-emerald-500/15 border border-emerald-400/30 backdrop-blur-xl rounded-2xl px-6 py-3 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <p className="text-sm font-semibold text-emerald-400">{themeMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* --------------- LIVE PREVIEW --------------- */}
      <div className="flex flex-col items-center">
        <div className="text-xs text-white/50 mb-2">Live preview</div>

        <div className="relative w-full max-w-sm">
          <div
            className={`relative w-full h-[600px] rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 border border-white/[0.12] hover:scale-[1.02] hover:shadow-3xl ${
              !animationsOff && activeInfo?.animated && !activePreview.startsWith("army") ? "theme-animated-gradient" : ""
            } ${!animationsOff && activePreview.startsWith("army") ? "theme-camo-animate" : ""} ${!animationsOff && activePreview === "glitter" ? "theme-glitter" : ""}`}
            style={editorOpen ? { background: customBg } : undefined}
          >
            {/* Camo / theme background layer */}
            {!editorOpen && (
              <div className={`absolute inset-0 ${previewBg.bg} ${!animationsOff && activePreview.startsWith("army") ? "theme-camo-float" : ""}`} />
            )}

            {/* Depth overlay (wrapper: dark tint + blur for readability) */}
            {!editorOpen && previewBg.wrapper && (
              <div className={`absolute inset-0 ${previewBg.wrapper}`} />
            )}

            {/* Noise overlay for army themes (luxury texture) */}
            {!editorOpen && activePreview.startsWith("army") && (
              <div className="absolute inset-0 bg-black/35 mix-blend-overlay pointer-events-none" />
            )}

            {/* Pink flash on army_pink select */}
            {pinkFlash && (
              <div className="absolute inset-0 z-20 bg-pink-500/30 pointer-events-none animate-pinkFlash rounded-3xl" />
            )}

            {/* Black flash on army_black select */}
            {blackFlash && (
              <div className="absolute inset-0 z-20 bg-black/50 pointer-events-none animate-blackFlash rounded-3xl" />
            )}

            {/* Content */}
            <div className="relative z-10 h-full">
              <TipPagePreview handle={handle} themeKey={activePreview} accentOverride={editorOpen ? customAccent : undefined} />
            </div>
          </div>

          {/* Lock overlay for locked themes */}
          {!isThemeUnlocked(activePreview, unlockedThemes) && (
            <>
              <div className="absolute inset-0 rounded-3xl bg-black/20 backdrop-blur-[1px] pointer-events-none">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[11px] px-3 py-1 rounded-full bg-black/70 backdrop-blur text-white/80 border border-white/[0.12]">
                  🔒 Premium Theme Preview
                </div>
              </div>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] z-10">
                <div className="rounded-xl bg-black/70 backdrop-blur-md border border-white/[0.12] p-3 text-center">
                  <p className="text-xs text-white/70 mb-2">🔒 This theme is locked</p>
                  <button
                    onClick={() => setModalTheme(activePreview)}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:opacity-90 transition"
                  >
                    Unlock for {THEME_PRICE_LABEL}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-white/55 mt-3">
          {isThemeUnlocked(activePreview, unlockedThemes)
            ? "This is how your page looks to visitors"
            : "Try it live before purchasing"}
        </p>

        {/* Inline purchase CTA below preview */}
        {!isThemeUnlocked(activePreview, unlockedThemes) && (
          <div className="mt-4 w-full max-w-sm">
            <button
              onClick={() => setModalTheme(activePreview)}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition ${
                themePurchasing
                  ? "bg-white/10 text-white/55"
                  : "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
              }`}
            >
              🔓 Unlock {THEME_LABELS[activePreview]?.name} — {THEME_PRICE_LABEL}
            </button>
          </div>
        )}
      </div>

      {/* Theme Unlock Modal */}
      {modalTheme && (
        <ThemeCheckoutModal
          theme={{
            id: modalTheme,
            name: ({ all: "Unlock All Themes", army_pack: "Hustle Pack", imher_pack: "I'm Her Pack" } as Record<string, string>)[modalTheme] ?? THEME_LABELS[modalTheme]?.name ?? modalTheme,
            price: modalTheme === "all" ? 4.99 : modalTheme === "army_pack" ? 2.99 : modalTheme === "imher_pack" ? 4.99 : 1.99,
          }}
          isLegacy
          onClose={() => setModalTheme(null)}
        />
      )}

      {/* Success animation overlay */}
      {successAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fadeIn">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center animate-scaleIn shadow-2xl shadow-emerald-500/40">
              <span className="text-3xl text-white">✓</span>
            </div>
            <p className="mt-4 text-white text-sm font-medium">Theme Unlocked</p>
          </div>
        </div>
      )}

      {/* Floating unlock text */}
      {successAnim && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-floatUp">
          <div className="text-emerald-400 text-sm font-semibold">+ Theme Unlocked</div>
        </div>
      )}
    </div>
  );
}

export default function ThemesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <ThemesContent />
    </Suspense>
  );
}
