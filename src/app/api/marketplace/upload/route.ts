import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  calculateRiskScore,
  determineThemeStatus,
  generateThemeHash,
  hasSuspiciousKeywords,
} from "@/lib/marketplace/riskScore";

export const runtime = "nodejs";

const MAX_PREVIEWS = 5;
const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_THEME_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: Request) {
  const supabase = await createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check legal acceptance
  const { data: legal } = await supabase
    .from("creator_legal_acceptance")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!legal) {
    return NextResponse.json({ error: "You must accept the Creator Marketplace Agreement first." }, { status: 403 });
  }

  // Check upload ban
  const { data: profile } = await supabaseAdmin
    .from("creator_marketplace_profiles")
    .select("upload_ban_until, active_strikes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.upload_ban_until && new Date(profile.upload_ban_until) > new Date()) {
    return NextResponse.json({ error: "Your upload access is currently suspended." }, { status: 403 });
  }
  if (profile && profile.active_strikes >= 3) {
    return NextResponse.json({ error: "Your creator account has been permanently banned from the marketplace." }, { status: 403 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const category = String(formData.get("category") ?? "Social");
  const tagsRaw = String(formData.get("tags") ?? "");
  const priceRaw = formData.get("price");
  const price = priceRaw ? parseFloat(String(priceRaw)) : null;

  if (!name) return NextResponse.json({ error: "Theme name is required." }, { status: 400 });

  const previews = formData.getAll("previews") as File[];
  if (previews.length === 0) return NextResponse.json({ error: "At least one preview image is required." }, { status: 400 });
  if (previews.length > MAX_PREVIEWS) return NextResponse.json({ error: `Maximum ${MAX_PREVIEWS} preview images allowed.` }, { status: 400 });

  for (const p of previews) {
    if (!ALLOWED_IMAGE_TYPES.includes(p.type)) {
      return NextResponse.json({ error: "Preview images must be PNG, JPEG, or WEBP." }, { status: 400 });
    }
    if (p.size > MAX_PREVIEW_SIZE) {
      return NextResponse.json({ error: "Each preview image must be under 5 MB." }, { status: 400 });
    }
  }

  const themeFile = formData.get("themeFile") as File | null;
  if (themeFile && themeFile.size > MAX_THEME_FILE_SIZE) {
    return NextResponse.json({ error: "Theme file must be under 20 MB." }, { status: 400 });
  }

  // Upload previews to Supabase Storage
  const previewUrls: string[] = [];
  for (let i = 0; i < previews.length; i++) {
    const buf = Buffer.from(await previews[i].arrayBuffer());
    const ext = previews[i].type.split("/")[1];
    const path = `marketplace/${user.id}/${Date.now()}_${i}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("themes")
      .upload(path, buf, { contentType: previews[i].type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: "Failed to upload preview image." }, { status: 500 });
    }
    const { data: { publicUrl } } = supabaseAdmin.storage.from("themes").getPublicUrl(path);
    previewUrls.push(publicUrl);
  }

  // Upload theme file if provided
  let themeFileUrl: string | null = null;
  if (themeFile) {
    const buf = Buffer.from(await themeFile.arrayBuffer());
    const ext = themeFile.name.endsWith(".zip") ? "zip" : "json";
    const path = `marketplace/${user.id}/${Date.now()}_theme.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("themes")
      .upload(path, buf, { contentType: themeFile.type, upsert: false });
    if (!upErr) {
      const { data: { publicUrl } } = supabaseAdmin.storage.from("themes").getPublicUrl(path);
      themeFileUrl = publicUrl;
    }
  }

  // Compute theme hash (name + description + category as fingerprint)
  const themeHash = generateThemeHash(`${user.id}:${name}:${description}:${category}`);

  // Check for duplicate hash
  const { data: existing } = await supabaseAdmin
    .from("themes")
    .select("id")
    .eq("theme_hash", themeHash)
    .maybeSingle();
  const duplicateWarning = !!existing;

  // Run basic risk analysis (logo detection is a stub here)
  const suspiciousKw = hasSuspiciousKeywords(`${name} ${description}`);
  const riskScore = calculateRiskScore({
    logoDetection: false, // Real logo detection is an async AI job
    duplicateSimilarity: duplicateWarning ? 100 : 0,
    creatorStrikes: profile?.active_strikes ?? 0,
    suspiciousKeywords: suspiciousKw,
    massUploads: false,
  });
  const status = determineThemeStatus(riskScore);

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  const { data: theme, error: insertErr } = await supabaseAdmin
    .from("themes")
    .insert({
      user_id: user.id,
      name,
      description,
      category,
      tags,
      price: price ?? null,
      is_public: false, // Becomes public only after approval
      status,
      risk_score: riskScore,
      moderation_reason: suspiciousKw ? "Suspicious keywords detected" : null,
      duplicate_warning: duplicateWarning,
      theme_hash: themeHash,
      preview_images: previewUrls,
      theme_file_url: themeFileUrl,
    })
    .select("id, status")
    .single();

  if (insertErr || !theme) {
    return NextResponse.json({ error: "Failed to save theme." }, { status: 500 });
  }

  return NextResponse.json({ id: theme.id, status: theme.status });
}
