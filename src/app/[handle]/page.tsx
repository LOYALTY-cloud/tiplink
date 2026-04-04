import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";
import type { Metadata } from "next";
import TipPublicClient from "./tip-public-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function getProfile(rawHandle: string) {
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");
  const supabase = getSupabase();
  const { data } = await supabase
    .from("profiles")
    .select(
      "user_id, handle, display_name, bio, location, avatar_url, links, stripe_account_id, stripe_charges_enabled, account_status, theme"
    )
    .ilike("handle", handle.replace(/%/g, "\\%").replace(/_/g, "\\_"))
    .maybeSingle()
    .returns<ProfileRow | null>();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);

  if (!profile) {
    return { title: "1neLink" };
  }

  const name = profile.display_name || profile.handle || "Creator";
  const description = profile.bio || `Support ${name} with a tip 💸`;
  const images = profile.avatar_url ? [profile.avatar_url] : [];

  return {
    title: `${name} on 1neLink`,
    description,
    openGraph: {
      title: name,
      description,
      images,
      type: "profile",
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: name,
      description,
      images,
    },
  };
}

export default async function PublicTipPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");

  const profile = await getProfile(rawHandle);

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Page not found</div>
          <div className="mt-2 text-sm text-white/70">
            This 1neLink page does not exist.
          </div>
        </div>
      </div>
    );
  }

  // Determine if the creator can currently accept tips:
  // - Must have a Stripe account linked
  // - Stripe must have enabled charges on that account
  // - Account must be active
  const status = profile.account_status ?? "active";

  // Closed account — show clear message, no tip form
  if (status === "closed" || status === "closed_finalized") {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="text-lg font-semibold">This account is closed</div>
          <p className="mt-2 text-sm text-white/50">
            This creator is no longer receiving tips.
          </p>
        </div>
      </div>
    );
  }

  // Restricted account — show unavailable message
  if (status === "restricted" || status === "suspended") {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="text-lg font-semibold">Page temporarily unavailable</div>
          <p className="mt-2 text-sm text-white/50">
            This creator&apos;s page is temporarily unavailable. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  const canAcceptTips = !!(profile.stripe_account_id && profile.stripe_charges_enabled);

  const safeProfile = {
    user_id: profile.user_id,
    handle: profile.handle ?? "",
    display_name: profile.display_name ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    avatar_url: profile.avatar_url ?? null,
    links: (profile as any).links ?? null,
    stripe_account_id: profile.stripe_account_id ?? null,
    canAcceptTips,
    theme: (profile as any).theme ?? null,
  };

  return <TipPublicClient profile={safeProfile} />;
}
