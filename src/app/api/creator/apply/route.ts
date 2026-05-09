import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveCreatorAccess } from "@/lib/creatorAccess";

export const runtime = "nodejs";

/**
 * POST /api/creator/apply
 * Body: { social_links, description, audience_size? }
 * Submits a creator application for admin review.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  let body: { social_links?: string; description?: string; audience_size?: string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const description = (body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  // Check for duplicate application
  const { data: existing } = await supabaseAdmin
    .from("creator_applications")
    .select("id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "approved") {
      return NextResponse.json({ error: "You are already an approved creator" }, { status: 400 });
    }
    if (existing.status === "pending") {
      return NextResponse.json({ error: "Your application is already under review" }, { status: 400 });
    }
    // Rejected → allow reapplication by updating the existing row
    const { error: updateErr } = await supabaseAdmin
      .from("creator_applications")
      .update({
        social_links: (body.social_links ?? "").trim() || null,
        description,
        audience_size: body.audience_size ? Number(body.audience_size) || null : null,
        status: "pending",
        review_notes: null,
        reviewed_at: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
    }
    return NextResponse.json({ success: true, reapplied: true });
  }

  // Fetch handle for username field
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("handle")
    .eq("user_id", userId)
    .maybeSingle();

  const { error: insertErr } = await supabaseAdmin
    .from("creator_applications")
    .insert({
      user_id: userId,
      username: (profile as { handle?: string | null } | null)?.handle ?? null,
      social_links: (body.social_links ?? "").trim() || null,
      description,
      audience_size: body.audience_size ? Number(body.audience_size) || null : null,
    });

  if (insertErr) {
    console.error("creator/apply: insert error", insertErr);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/creator/apply
 * Returns the current user's application status (if any).
 */
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  const { data: application } = await supabaseAdmin
    .from("creator_applications")
    .select("id, status, review_notes, created_at, reviewed_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_creator, total_sales, total_revenue, stripe_charges_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: creatorStore } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  const access = effectiveCreatorAccess({
    email,
    isCreator: (profile as { is_creator?: boolean } | null)?.is_creator ?? false,
  });

  const { data: marketplaceProfile } = await supabaseAdmin
    .from("creator_marketplace_profiles")
    .select("upload_ban_until")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    application: application ?? null,
    is_creator: access.isCreator,
    owner_elite: access.ownerElite,
    total_sales: (profile as { total_sales?: number | null } | null)?.total_sales ?? 0,
    total_revenue: (profile as { total_revenue?: number | null } | null)?.total_revenue ?? 0,
    has_active_store: creatorStore?.is_active === true,
    charges_enabled: Boolean((profile as { stripe_charges_enabled?: boolean | null } | null)?.stripe_charges_enabled),
    upload_ban_until: marketplaceProfile?.upload_ban_until ?? null,
  });
}
