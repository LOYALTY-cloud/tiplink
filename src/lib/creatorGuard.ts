import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveCreatorAccess } from "@/lib/creatorAccess";

export type CreatorSession = {
  userId: string;
  owner_elite: boolean;
};

export async function requireCreator(req: Request): Promise<CreatorSession | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_creator")
    .eq("user_id", userId)
    .maybeSingle();

  const access = effectiveCreatorAccess({
    email,
    isCreator: !!profile?.is_creator,
  });

  if (!access.isCreator) {
    return NextResponse.json(
      { error: "Creator access required. Apply at /dashboard to unlock monetization." },
      { status: 403 }
    );
  }

  return {
    userId,
    owner_elite: access.ownerElite,
  };
}

export function assertTier(): NextResponse | null {
  return null;
}
