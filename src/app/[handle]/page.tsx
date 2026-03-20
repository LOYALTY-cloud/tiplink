import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";
import TipPublicClient from "./tip-public-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicTipPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Public read profile by handle/username (case-insensitive)
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "user_id, handle, display_name, bio, location, avatar_url, links, stripe_account_id"
    )
    .ilike("handle", handle.replace(/%/g, "\\%").replace(/_/g, "\\_"))
    .maybeSingle()
    .returns<ProfileRow | null>();

  if (error) {
    console.error("[PublicTipPage] Supabase error for handle:", handle, error);
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Page not found</div>
          <div className="mt-2 text-sm text-white/70">
            This TipLinkMe page does not exist.
          </div>
        </div>
      </div>
    );
  }

  const safeProfile = {
    user_id: profile.user_id,
    handle: profile.handle ?? "",
    display_name: profile.display_name ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    avatar_url: profile.avatar_url ?? null,
    links: (profile as any).links ?? null,
    stripe_account_id: profile.stripe_account_id ?? null,
  };

  if (!profile.stripe_account_id) {
    return (
      <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-xl font-semibold mb-4">Creator is not accepting tips yet</h2>

          <p className="text-gray-400">This creator hasn't finished setting up their account.</p>
        </div>
      </div>
    );
  }

  return <TipPublicClient profile={safeProfile} />;
}
