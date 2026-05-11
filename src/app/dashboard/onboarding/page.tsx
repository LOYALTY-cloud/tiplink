"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
const StripeEmbeddedOnboarding = dynamic(
  () => import("@/components/StripeEmbeddedOnboarding"),
  { ssr: false, loading: () => (
    <div className="flex items-center gap-2 text-sm text-white/70 py-6">
      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span>Loading secure onboarding…</span>
    </div>
  )},
);
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_CREATOR_CATEGORIES, type CreatorCategory } from "@/lib/creatorCategories";

type CreatorCategoriesResponse = {
  categories?: CreatorCategory[];
};

function OnboardingContent() {
  const searchParams = useSearchParams();
  const isManage = searchParams.get("manage") === "1";
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteSaved, setWebsiteSaved] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<CreatorCategory[]>([]);
  const [creatorCategory, setCreatorCategory] = useState<string>("");
  const [savingCreatorCategory, setSavingCreatorCategory] = useState(false);
  const [continuingToStripe, setContinuingToStripe] = useState(false);
  const [categorySaved, setCategorySaved] = useState(false);
  const [categoryCollapsed, setCategoryCollapsed] = useState(false);
  const [stripeKey, setStripeKey] = useState(0); // increment to remount Stripe component on retry
  const onboardingRef = useRef<HTMLDivElement | null>(null);
  // Always-current ref so fetchStripeSecret never closes over stale state
  const creatorCategoryRef = useRef(creatorCategory);
  creatorCategoryRef.current = creatorCategory;

  const persistCreatorCategory = async (categoryValue?: string) => {
    const category = categoryValue ?? creatorCategory;
    if (!category) return false;

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw new Error("Not authenticated");

    // Use UPDATE only (RLS allows users to update their own row; INSERT requires service role)
    // The session API endpoint saves the category server-side via admin client anyway.
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ creator_activity_category: category })
      .eq("user_id", userRes.user.id);

    // Ignore RLS/update errors — the server endpoint will persist it
    if (updateErr) {
      console.warn("Client-side category save failed (server will retry):", updateErr.message);
    }
    return true;
  };

  const createStripeSession = async (opts?: { token?: string; retryOnCategoryError?: boolean; categoryOverride?: string }) => {
    try {
      // Use categoryOverride when calling from useEffect to bypass stale state
      const effectiveCategory = opts?.categoryOverride ?? creatorCategory;
      if (!isManage && !effectiveCategory) {
        // Silently skip — user just hasn't chosen yet, don't show an error on mount
        return false;
      }

      const token = opts?.token || (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      setError(null);
      const res = await fetch("/api/stripe/connect/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: isManage ? "manage" : "onboarding",
          creator_activity_category: isManage ? undefined : (opts?.categoryOverride ?? creatorCategory),
        }),
      });

      const rawText = await res.text().catch(() => "");
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(rawText); } catch { /* non-JSON body */ }
      if (!res.ok) {
        const checkpoint = (j._checkpoint as string) || "unknown";
        const detail = (j._detail as string) || "";
        const errMsg = (j.error as string) || (rawText.length < 300 ? rawText : "Could not create session");
        const message = `[${res.status} @ ${checkpoint}] ${errMsg}${detail ? ` — ${detail}` : ""}`;

        // Safety retry: if category wasn't persisted yet, save and retry once.
        if (
          !isManage &&
          opts?.retryOnCategoryError !== false &&
          typeof message === "string" &&
          message.toLowerCase().includes("creator activity category")
        ) {
          try {
            const saved = await persistCreatorCategory(effectiveCategory);
            if (saved) {
              return await createStripeSession({ token, categoryOverride: effectiveCategory, retryOnCategoryError: false });
            }
          } catch {
            // fall through to original error handling below
          }
        }

        throw new Error(message);
      }

      setClientSecret(j.client_secret || "");
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return false;
    }
  };

  /**
   * Called by Stripe's embedded component on mount and whenever it needs to refresh
   * its session token. Must return a *fresh* cacs_… client secret each invocation —
   * reusing a previously-returned secret causes an "authentication error" in the iframe.
   */
  const fetchStripeSecret = useCallback(async (): Promise<string> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const res = await fetch("/api/stripe/connect/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mode: isManage ? "manage" : "onboarding",
        creator_activity_category: isManage ? undefined : (creatorCategoryRef.current || undefined),
      }),
    });

    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((j.error as string) || "Failed to create Stripe session");
    const secret = j.client_secret as string | undefined;
    if (!secret) throw new Error("No client secret returned");
    // Keep the gate state in sync so the parent knows a session was created.
    setClientSecret(secret);
    return secret;
  }, [isManage]); // isManage is stable (search param); creatorCategoryRef is always current

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      try {
        // Single auth call — getSession() returns both user and token.
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        const token = sess.session?.access_token;
        if (!user || !token) throw new Error("Not authenticated");

        const [categoriesRes, profileRes] = await Promise.all([
          fetch("/api/creator-categories", { cache: "no-store" }),
          supabase
            .from("profiles")
            .select("id, creator_activity_category")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const categoryJson = (await categoriesRes.json().catch(() => ({}))) as CreatorCategoriesResponse;
        const fetchedCategories = Array.isArray(categoryJson.categories) ? categoryJson.categories : [];
        const categories = fetchedCategories.length > 0 ? fetchedCategories : DEFAULT_CREATOR_CATEGORIES;
        if (mounted) setAvailableCategories(categories);

        const profile = profileRes.data;
        if (mounted) {
          if (profile?.creator_activity_category) {
            setCreatorCategory(profile.creator_activity_category);
          } else if (categories[0]?.name) {
            setCreatorCategory(categories[0].name);
          }
        }

        if (profile?.id) {
          supabase
            .from("social_links")
            .select("url")
            .eq("profile_id", profile.id)
            .order("sort_order", { ascending: true })
            .limit(1)
            .then(({ data: links }) => {
              if (mounted && links?.[0]?.url) setWebsite(links[0].url);
            });
        }

        // Only auto-create Stripe session when onboarding can proceed.
        // Pass the resolved category directly to avoid reading stale state.
        const resolvedCategory = profile?.creator_activity_category || null;
        const canStartOnboarding = isManage || Boolean(resolvedCategory);
        if (canStartOnboarding && mounted) {
          await createStripeSession({ token, categoryOverride: resolvedCategory ?? undefined });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
    return () => {
      mounted = false;
    };
  }, [isManage]);

  const saveWebsite = async () => {
    setSavingWebsite(true);
    setWebsiteSaved(false);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userRes.user.id)
          .maybeSingle();

        if (prof?.id) {
          // Clear existing links first, then insert new one
          await supabase.from("social_links").delete().eq("profile_id", prof.id);

          const url = website.trim();
          if (url && /^https?:\/\/.+/i.test(url)) {
            // Auto-detect type from URL
            const u = url.toLowerCase();
            let type = "website";
            if (u.includes("instagram.com")) type = "instagram";
            else if (u.includes("tiktok.com")) type = "tiktok";
            else if (u.includes("x.com") || u.includes("twitter.com")) type = "x";
            else if (u.includes("youtube.com") || u.includes("youtu.be")) type = "youtube";

            const { error: insertErr } = await supabase.from("social_links").insert({
              profile_id: prof.id,
              type,
              url,
              sort_order: 0,
            });

            if (insertErr) throw insertErr;
          }
          setWebsiteSaved(true);
          setTimeout(() => setWebsiteSaved(false), 2000);
        }
      }
    } catch {
      setError("Could not save website info. Please try again.");
    } finally {
      setSavingWebsite(false);
    }
  };

  const saveCreatorCategory = async () => {
    if (!creatorCategory) return;

    setSavingCreatorCategory(true);
    setCategorySaved(false);
    try {
      const saved = await persistCreatorCategory();
      if (!saved) return;

      setCategorySaved(true);
      setCategoryCollapsed(true);
      setTimeout(() => {
        onboardingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);

      // Immediately continue by creating Stripe session once category is saved.
      await createStripeSession({ retryOnCategoryError: false });
    } catch {
      setError("Could not save creator activity. Please try again.");
    } finally {
      setSavingCreatorCategory(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  const groupedCategories = availableCategories.reduce<Record<string, CreatorCategory[]>>((acc, category) => {
    const key = category.group_name || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(category);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-white mb-2">{isManage ? "Payout Settings" : "Activate Your Payouts"}</h1>
      <p className="text-sm text-white/70 mb-6">{isManage ? "Manage your connected bank account and payout preferences." : "Connect your bank account to start receiving tips and withdrawals."}</p>

      {error ? <p className="text-red-400 font-medium mb-4">{error}</p> : null}

      <div className="space-y-3 mb-8 transition-all duration-300">
        {categoryCollapsed ? (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 flex items-center justify-between animate-[fadeIn_0.25s_ease]">
            <div>
              <p className="text-sm font-semibold text-green-300">Creator category saved</p>
              <p className="text-xs text-white/50 mt-1">{creatorCategory}</p>
            </div>
            <button
              type="button"
              onClick={() => setCategoryCollapsed(false)}
              className="text-xs text-white/50 hover:text-white transition"
            >
              Edit
            </button>
          </div>
        ) : (
          <>
            <label className="text-xs text-white/70 font-medium">
              How do you use 1neLink?
            </label>
            <div className="space-y-4">
              {Object.entries(groupedCategories).map(([groupName, categories]) => (
                <div key={groupName} className="space-y-2">
                  <h3 className="text-xs uppercase tracking-[0.16em] text-white/45">{groupName}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {categories.map((category) => {
                      const isSelected = creatorCategory === category.name;
                      return (
                        <button
                          key={category.name}
                          type="button"
                          onClick={() => setCreatorCategory(category.name)}
                          className={[
                            "rounded-xl border px-3 py-2.5 text-sm text-left transition",
                            isSelected
                              ? "border-blue-400/60 bg-blue-500/20 text-white"
                              : "border-white/[0.12] bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
                          ].join(" ")}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {availableCategories.length === 0 ? (
                <p className="text-xs text-white/50">No categories available yet. Please try again.</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveCreatorCategory}
                disabled={savingCreatorCategory || !creatorCategory}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600 transition disabled:opacity-50"
              >
                {savingCreatorCategory ? "Saving..." : categorySaved ? "Saved ✓" : "Continue"}
              </button>
              <p className="text-xs text-white/55">
                Category metadata drives Stripe descriptions, payout policy, and risk controls.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── WEBSITE / SOCIAL PROFILE ───────────────────── */}
      <div ref={onboardingRef} className="space-y-2 mb-8">
        <label className="text-xs text-white/70 font-medium">
          Website or Social Profile
        </label>

        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://instagram.com/yourname"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="flex-1 bg-white/[0.06] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/20 transition"
          />
          <button
            type="button"
            onClick={saveWebsite}
            disabled={savingWebsite}
            className="px-4 py-3 text-sm font-semibold rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600 transition disabled:opacity-50"
          >
            {savingWebsite ? "Saving…" : websiteSaved ? "✓ Saved" : "Save"}
          </button>
        </div>

        <p className="text-xs text-white/55">
          Add a website, Instagram, TikTok, or link-in-bio so we can verify your account.
        </p>

        {/* Quick select buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            type="button"
            onClick={() => setWebsite("https://instagram.com/")}
            className="px-3 py-1.5 text-xs rounded-full bg-white/[0.06] border border-white/[0.12] text-white/75 hover:bg-white/10 hover:text-white transition"
          >
            Instagram
          </button>
          <button
            type="button"
            onClick={() => setWebsite("https://www.tiktok.com/@")}
            className="px-3 py-1.5 text-xs rounded-full bg-white/[0.06] border border-white/[0.12] text-white/75 hover:bg-white/10 hover:text-white transition"
          >
            TikTok
          </button>
          <button
            type="button"
            onClick={() => setWebsite("https://x.com/")}
            className="px-3 py-1.5 text-xs rounded-full bg-white/[0.06] border border-white/[0.12] text-white/75 hover:bg-white/10 hover:text-white transition"
          >
            X
          </button>
          <button
            type="button"
            onClick={() => setWebsite("")}
            className="px-3 py-1.5 text-xs rounded-full bg-white/[0.06] border border-white/[0.12] text-white/75 hover:bg-white/10 hover:text-white transition"
          >
            Clear
          </button>
        </div>
      </div>

      {clientSecret ? (
        <StripeEmbeddedOnboarding
          key={stripeKey}
          fetchClientSecret={fetchStripeSecret}
          mode={isManage ? "manage" : "onboarding"}
          onRetry={() => setStripeKey((k) => k + 1)}
        />
      ) : (
        <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-5 mt-6 space-y-3">
          <p className="text-sm font-medium text-white/80">
            {creatorCategory
              ? "Ready to connect your payout account."
              : "Choose a creator category above to continue."}
          </p>
          {creatorCategory && (
            <button
              type="button"
              onClick={async () => {
                setContinuingToStripe(true);
                try {
                  await createStripeSession();
                } finally {
                  setContinuingToStripe(false);
                }
              }}
              disabled={continuingToStripe}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 text-white hover:from-blue-400 hover:to-blue-600 transition disabled:opacity-50"
            >
              {continuingToStripe ? "Continuing..." : "Continue to Stripe"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p>Loading onboarding...</p>}>
      <OnboardingContent />
    </Suspense>
  );
}
