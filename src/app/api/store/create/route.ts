import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]$/;

/**
 * POST /api/store/create
 *
 * Sets the store_name, slug, and description for the authenticated creator's store.
 * Requires an active subscription (is_active = true on the creator_stores row).
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId, owner_elite } = session;

  // Verify store is active (subscription must have been paid)
  const { data: store } = await supabaseAdmin
    .from("creator_stores")
    .select("id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  let activeStore = store;
  if (!activeStore?.is_active) {
    if (!owner_elite) {
      return NextResponse.json(
        { error: "Active store subscription required. Subscribe first to set up your store." },
        { status: 403 }
      );
    }

    // Owner bypass: ensure store is active without requiring paid subscription.
    let { data: ownerStore, error: ownerUpsertErr } = await supabaseAdmin
      .from("creator_stores")
      .upsert(
        {
          user_id: userId,
          is_active: true,
          billing_type: "balance",
          billing_status: "active",
          grace_until: null,
          renews_at: null,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("id, is_active")
      .single();

    if (ownerUpsertErr || !ownerStore) {
      const fallback = await supabaseAdmin
        .from("creator_stores")
        .upsert(
          {
            user_id: userId,
            is_active: true,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select("id, is_active")
        .single();

      ownerStore = fallback.data ?? null;
      ownerUpsertErr = fallback.error ?? ownerUpsertErr;
    }

    if (ownerUpsertErr || !ownerStore?.id) {
      console.error("store/create owner activation:", ownerUpsertErr);
      return NextResponse.json({ error: "Failed to activate owner store" }, { status: 500 });
    }

    activeStore = ownerStore;
  }

  let body: { name?: unknown; slug?: unknown; description?: unknown; avatar_url?: unknown; banner_url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 80) : null;
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase().slice(0, 48) : null;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) : null;
  const avatar_url = typeof body.avatar_url === "string" && body.avatar_url ? body.avatar_url : undefined;
  const banner_url = typeof body.banner_url === "string" && body.banner_url ? body.banner_url : undefined;

  if (!name) return NextResponse.json({ error: "store name is required" }, { status: 400 });
  if (!slug)  return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be 3–48 lowercase letters, digits, or hyphens (no leading/trailing hyphens)" },
      { status: 400 }
    );
  }

  // Check slug uniqueness (excluding own store)
  const { data: slugConflict } = await supabaseAdmin
    .from("creator_stores")
    .select("id")
    .eq("slug", slug)
    .neq("id", activeStore.id)
    .maybeSingle();

  if (slugConflict) {
    return NextResponse.json({ error: "That slug is already taken" }, { status: 409 });
  }

  // Check store-name uniqueness (case-insensitive, excluding own store)
  const { data: nameConflict } = await supabaseAdmin
    .from("creator_stores")
    .select("id")
    .ilike("store_name", name)
    .neq("id", activeStore.id)
    .maybeSingle();

  if (nameConflict) {
    return NextResponse.json({ error: "That store name is already taken. Please choose another name." }, { status: 409 });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("creator_stores")
    .update({
      store_name: name,
      slug,
      description,
      ...(avatar_url !== undefined && { avatar_url }),
      ...(banner_url !== undefined && { banner_url }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", activeStore.id)
    .select("id, store_name, slug, description, is_active, avatar_url, banner_url")
    .single();

  if (updateErr) {
    console.error("store/create:", updateErr);
    return NextResponse.json({ error: "Failed to update store" }, { status: 500 });
  }

  // Purge ISR cache so banner/avatar changes are visible immediately
  revalidatePath(`/store/${slug}`);

  return NextResponse.json({ store: updated });
}
