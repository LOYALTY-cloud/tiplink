import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/marketplace/legal-check — returns { accepted: boolean } */
export async function GET() {
  const supabase = await createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ accepted: false });

  const { data } = await supabase
    .from("creator_legal_acceptance")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ accepted: !!data });
}
