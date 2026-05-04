"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StripeEmbeddedOnboarding from "@/components/StripeEmbeddedOnboarding";
import { supabase } from "@/lib/supabase/client";

function OnboardingContent() {
  const searchParams = useSearchParams();
  const isManage = searchParams.get("manage") === "1";
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteSaved, setWebsiteSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        // Single auth call — getSession() returns both user and token.
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        const token = sess.session?.access_token;
        if (!user || !token) throw new Error("Not authenticated");

        // Load existing website social link from profile (fire-and-forget, non-blocking)
        supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data: prof }) => {
            if (!mounted || !prof?.id) return;
            supabase
              .from("social_links")
              .select("url")
              .eq("profile_id", prof.id)
              .order("sort_order", { ascending: true })
              .limit(1)
              .then(({ data: links }) => {
                if (mounted && links?.[0]?.url) setWebsite(links[0].url);
              });
          });

        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch("/api/stripe/connect/session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ mode: isManage ? "manage" : "onboarding" }),
          signal: controller.signal,
        });
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not create session");
        if (!mounted) return;
        setClientSecret(j.client_secret || "");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("aborted")) {
          setError("Onboarding request timed out. Please try again.");
        } else {
          setError(message);
        }
      } finally {
        if (timeout) clearTimeout(timeout);
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

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
  if (error) return <p className="text-red-400 font-medium">Error: {error}</p>;
  if (!clientSecret) return <p className="text-white/70">No onboarding session available.</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-white mb-2">{isManage ? "Payout Settings" : "Activate Your Payouts"}</h1>
      <p className="text-sm text-white/70 mb-6">{isManage ? "Manage your connected bank account and payout preferences." : "Connect your bank account to start receiving tips and withdrawals."}</p>

      {/* ── WEBSITE / SOCIAL PROFILE ───────────────────── */}
      <div className="space-y-2 mb-8">
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

      <StripeEmbeddedOnboarding clientSecret={clientSecret} mode={isManage ? "manage" : "onboarding"} />
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
