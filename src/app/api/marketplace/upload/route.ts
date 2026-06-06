import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  calculateRiskScore,
  determineThemeStatus,
  generateThemeHash,
  hasSuspiciousKeywords,
} from "@/lib/marketplace/riskScore";
import { detectLogosWithAI } from "@/lib/marketplace/logoDetection";
import { computeAverageHash, isNearDuplicate } from "@/lib/marketplace/perceptualHash";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminNotification } from "@/lib/adminNotifications";

// Mass-upload threshold: more than 5 themes in the last hour
const MASS_UPLOAD_THRESHOLD = 5;
const MASS_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

// Kill switch — set AI_MODERATION_ENABLED=false in Vercel env to disable auto-flagging
const AI_MODERATION_ENABLED = process.env.AI_MODERATION_ENABLED !== "false";

// Max themes auto-flagged per hour across all users. If exceeded, route to pending_review only.
const MAX_AUTO_FLAGS_PER_HOUR = 50;

// Protected creator: high-trust creators skip auto-flagging for low-risk signals
function isProtectedCreator(trustScore: number, verified: boolean, strikes: number): boolean {
  return trustScore >= 85 && verified && strikes === 0;
}

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
    const isPermanent = new Date(profile.upload_ban_until).getFullYear() >= 9999;
    return NextResponse.json({
      error: isPermanent
        ? "Your Theme Store access has been permanently revoked due to repeated violations."
        : "Your upload access is currently suspended.",
    }, { status: 403 });
  }
  // Redundant safety check — active_strikes >= 3 should always have ban set, but guard anyway
  if (profile && profile.active_strikes >= 3) {
    return NextResponse.json({ error: "Your Theme Store access has been permanently revoked due to repeated violations." }, { status: 403 });
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

  // Check for exact text-hash duplicate
  const { data: existing } = await supabaseAdmin
    .from("themes")
    .select("id")
    .eq("theme_hash", themeHash)
    .maybeSingle();
  const duplicateWarning = !!existing;

  // ── Risk pipeline ────────────────────────────────────────────────────────────

  // Fetch full creator profile for protected-creator check
  const { data: creatorProfile } = await supabaseAdmin
    .from("creator_marketplace_profiles")
    .select("trust_score, verified_identity, active_strikes")
    .eq("user_id", user.id)
    .maybeSingle();

  const creatorIsProtected = isProtectedCreator(
    creatorProfile?.trust_score ?? 0,
    creatorProfile?.verified_identity ?? false,
    creatorProfile?.active_strikes ?? 0,
  );


  // 1. Mass-upload detection: count uploads in the last hour
  const windowStart = new Date(Date.now() - MASS_UPLOAD_WINDOW_MS).toISOString();
  const { count: recentUploads } = await supabaseAdmin
    .from("themes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", windowStart);
  const massUploads = (recentUploads ?? 0) >= MASS_UPLOAD_THRESHOLD;

  // 2. Perceptual hash of the first preview image (for visual duplicate detection)
  let imageHash: string | null = null;
  let visualDuplicate = false;
  try {
    const firstBuf = Buffer.from(await previews[0].arrayBuffer());
    imageHash = await computeAverageHash(firstBuf);

    // Compare against existing image hashes in DB
    const { data: existingHashes } = await supabaseAdmin
      .from("themes")
      .select("image_hash")
      .not("image_hash", "is", null)
      .neq("user_id", user.id); // only flag cross-creator visual duplicates
    if (existingHashes) {
      for (const row of existingHashes) {
        if (row.image_hash && isNearDuplicate(imageHash, row.image_hash)) {
          visualDuplicate = true;
          break;
        }
      }
    }
  } catch (err) {
    console.error("[upload] perceptual hash error (failing open):", err);
  }

  // 3. AI logo detection on first preview image
  // Rate-limited to 10 AI calls per hour per user to prevent cost abuse.
  let logoDetection = false;
  if (previewUrls[0]) {
    const aiLimit = await rateLimit(`logo_detect:${user.id}`, 10, 3600);
    if (aiLimit.allowed) {
      logoDetection = await detectLogosWithAI(previewUrls[0]);
    }
    // If rate limit exceeded, skip AI check — risk score will be lower but
    // mass-upload signal will be elevated anyway.
  }

  // 4. Keyword check
  const suspiciousKw = hasSuspiciousKeywords(`${name} ${description}`);

  // 5. Compute final risk score + status
  const riskScore = calculateRiskScore({
    logoDetection: AI_MODERATION_ENABLED ? logoDetection : false,
    duplicateSimilarity: (duplicateWarning || visualDuplicate) ? 100 : 0,
    creatorStrikes: profile?.active_strikes ?? 0,
    suspiciousKeywords: AI_MODERATION_ENABLED ? suspiciousKw : false,
    massUploads,
  });

  // Protected creators skip auto-flagging for borderline risk (≤60);
  // only hard evidence (logo detection, exact duplicate) can still flag them.
  const hardEvidence = logoDetection || duplicateWarning;
  let status = determineThemeStatus(riskScore);
  if (creatorIsProtected && status === "flagged" && !hardEvidence) {
    status = "pending_review"; // downgrade to human review, not auto-flag
  }

  // Kill switch: if AI moderation is disabled, cap at pending_review
  if (!AI_MODERATION_ENABLED && status === "flagged") {
    status = "pending_review";
  }

  // Auto-flag rate limiter: if platform has already auto-flagged too many
  // themes this hour, switch to pending_review to prevent mass-flag bugs.
  if (status === "flagged") {
    const flagLimit = await rateLimit("auto_flag_global", MAX_AUTO_FLAGS_PER_HOUR, 3600);
    if (!flagLimit.allowed) {
      status = "pending_review";
    }
  }

  const moderationReasons: string[] = [];
  if (!AI_MODERATION_ENABLED) moderationReasons.push("AI moderation disabled (kill switch)");
  if (logoDetection) moderationReasons.push("AI detected brand logo");
  if (visualDuplicate) moderationReasons.push("Visual near-duplicate detected");
  if (duplicateWarning) moderationReasons.push("Exact duplicate hash");
  if (suspiciousKw) moderationReasons.push("Suspicious keywords");
  if (massUploads) moderationReasons.push("Mass upload activity");
  if (creatorIsProtected && !hardEvidence) moderationReasons.push("Protected creator — downgraded from auto-flag");

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
      moderation_reason: moderationReasons.length > 0 ? moderationReasons.join("; ") : null,
      duplicate_warning: duplicateWarning || visualDuplicate,
      theme_hash: themeHash,
      image_hash: imageHash,
      preview_images: previewUrls,
      theme_file_url: themeFileUrl,
      queue_entered_at: status === "pending_review" ? new Date().toISOString() : null,
    })
    .select("id, status")
    .single();

  if (insertErr || !theme) {
    return NextResponse.json({ error: "Failed to save theme." }, { status: 500 });
  }

  // Write moderation log (non-blocking)
  if (moderationReasons.length > 0 || riskScore > 0) {
    supabaseAdmin
      .from("moderation_logs")
      .insert({
        theme_id: theme.id,
        creator_id: user.id,
        event_type: status === "flagged" ? "auto_flag" : "ai_scan",
        ai_reason: moderationReasons.join("; ") || "passed",
        risk_score: riskScore,
        metadata: {
          ai_enabled: AI_MODERATION_ENABLED,
          creator_protected: creatorIsProtected,
        },
      })
      .then(() => {/* fire and forget */});
  }

  // Notify admins/moderators when theme enters pending_review from upload
  if (theme.status === "pending_review") {
    const { data: uploaderProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, handle")
      .eq("user_id", user.id)
      .maybeSingle();
    const creatorName = uploaderProfile?.display_name || uploaderProfile?.handle || "A creator";
    void createAdminNotification({
      type: "marketplace_alert",
      title: "New theme submitted for review",
      message: `${creatorName} uploaded "${name}" for marketplace review. Pending a moderation decision.`,
      link: "/admin/marketplace",
      requiresAction: true,
      priority: "medium",
      visibility: "role",
      roleTarget: ["owner", "co_owner", "super_admin", "admin", "moderator"],
      metadata: { theme_id: theme.id, user_id: user.id, creator: creatorName, risk_score: riskScore },
    });
  }

  return NextResponse.json({ id: theme.id, status: theme.status });
}
