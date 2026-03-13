import { createClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/types/db";
import TipPublicClient from "./tip-public-client";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function PublicTipPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).replace(/^@/, "");

  // Public read profile by handle/username
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, bio, location, avatar_url, links")
    .eq("handle", handle)
    .maybeSingle()
    .returns<ProfileRow | null>();

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
  };

  return <TipPublicClient profile={safeProfile} />;
}
