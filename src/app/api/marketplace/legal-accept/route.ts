import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** POST /api/marketplace/legal-accept */
export async function POST(req: Request) {
  const supabase = await createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let policyVersion: string;
  try {
    const body = await req.json();
    policyVersion = String(body.policyVersion ?? "").trim();
    if (!policyVersion) throw new Error("missing");
  } catch {
    return NextResponse.json({ error: "policyVersion is required" }, { status: 400 });
  }

  // Upsert — idempotent if called twice
  const { error } = await supabase
    .from("creator_legal_acceptance")
    .upsert(
      { user_id: user.id, policy_version: policyVersion },
      { onConflict: "user_id,policy_version", ignoreDuplicates: true },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to record acceptance." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
