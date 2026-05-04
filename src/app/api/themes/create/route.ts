import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";
import {
  AnimationType,
  getAllowedEliteEffects,
  isPhotoAnimationType,
  normalizeAnimationType,
  normalizeEliteEffects,
  normalizeLighting,
  normalizeMotion,
  normalizeOverlay,
} from "@/lib/animationAccess";
import { getAnimationTierError, getMotionTierError, getOverlayTierError } from "@/lib/themeAnimationValidation";
import { detectThemeCategorySlug } from "@/lib/themeCategories";
import { THEME_VIDEO_RULES } from "@/lib/themeVideoRules";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireCreator(req);
    if (session instanceof NextResponse) return session;
    const { userId } = session;

    const body = await req.json();
    const name: string = typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 100)
      : "My Theme";

    if (!body.config || typeof body.config !== "object") {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }

    // Whitelist allowed config keys — block arbitrary JSON injection
    const {
      primaryColor, textColor, background, animation,
      backgroundType, animationType, animationSpeed, animationIntensity,
      motion, overlay, lighting, speed, intensity,
      eliteEffects,
      cardBgMode,
      cardBackground,
      cardGradientFrom, cardGradientTo, cardGradientDir,
      cardImage, cardOverlay,
      backgroundMediaType,
      backgroundVideo,
      backgroundVideoPoster,
      backgroundVideoDuration,
      motionSettings,
    } = body.config as Record<string, unknown>;

    const safeAnimationType = typeof animationType === "string"
      ? normalizeAnimationType(animationType)
      : null;

    const safeMotion = normalizeMotion(motion ?? safeAnimationType);
    const safeOverlay = normalizeOverlay(overlay ?? (Array.isArray(eliteEffects) ? eliteEffects[0] : null));
    const safeLighting = normalizeLighting(lighting);

    const safeBackground = typeof background === "string" ? background : undefined;
    const safeBackgroundVideo = typeof backgroundVideo === "string" ? backgroundVideo : undefined;
    const safeBackgroundVideoPoster = typeof backgroundVideoPoster === "string" ? backgroundVideoPoster : undefined;
    const safeBackgroundVideoDuration = typeof backgroundVideoDuration === "number"
      ? Math.min(THEME_VIDEO_RULES.targetDurationSeconds, Math.max(0, backgroundVideoDuration))
      : undefined;
    const rawMotionSettings =
      motionSettings && typeof motionSettings === "object"
        ? (motionSettings as Record<string, unknown>)
        : {};
    const safeMotionSettings = {
      color:
        rawMotionSettings.color === "pink" ||
        rawMotionSettings.color === "red" ||
        rawMotionSettings.color === "purple" ||
        rawMotionSettings.color === "white"
          ? rawMotionSettings.color
          : undefined,
      subjectImage: typeof rawMotionSettings.subjectImage === "string" ? rawMotionSettings.subjectImage : undefined,
      midImage: typeof rawMotionSettings.midImage === "string" ? rawMotionSettings.midImage : undefined,
      backgroundImage: typeof rawMotionSettings.backgroundImage === "string" ? rawMotionSettings.backgroundImage : undefined,
      rippleIntensity:
        rawMotionSettings.rippleIntensity === "soft" ||
        rawMotionSettings.rippleIntensity === "medium" ||
        rawMotionSettings.rippleIntensity === "strong"
          ? rawMotionSettings.rippleIntensity
          : undefined,
      waterIntensity:
        rawMotionSettings.waterIntensity === "soft" ||
        rawMotionSettings.waterIntensity === "medium" ||
        rawMotionSettings.waterIntensity === "strong"
          ? rawMotionSettings.waterIntensity
          : undefined,
      rainStyle:
        rawMotionSettings.rainStyle === "soft" ||
        rawMotionSettings.rainStyle === "storm" ||
        rawMotionSettings.rainStyle === "luxury"
          ? rawMotionSettings.rainStyle
          : undefined,
      fireStyle:
        rawMotionSettings.fireStyle === "embers" ||
        rawMotionSettings.fireStyle === "flameEdge" ||
        rawMotionSettings.fireStyle === "sparks"
          ? rawMotionSettings.fireStyle
          : undefined,
      vortexStyle:
        rawMotionSettings.vortexStyle === "slow" ||
        rawMotionSettings.vortexStyle === "fast" ||
        rawMotionSettings.vortexStyle === "falling"
          ? rawMotionSettings.vortexStyle
          : undefined,
      clubBeat:
        rawMotionSettings.clubBeat === "slow" ||
        rawMotionSettings.clubBeat === "normal" ||
        rawMotionSettings.clubBeat === "fast"
          ? rawMotionSettings.clubBeat
          : undefined,
      clubFlashMode:
        rawMotionSettings.clubFlashMode === "off" ||
        rawMotionSettings.clubFlashMode === "white" ||
        rawMotionSettings.clubFlashMode === "club"
          ? rawMotionSettings.clubFlashMode
          : undefined,
      seasonalDensity:
        rawMotionSettings.seasonalDensity === "low" ||
        rawMotionSettings.seasonalDensity === "medium" ||
        rawMotionSettings.seasonalDensity === "high"
          ? rawMotionSettings.seasonalDensity
          : undefined,
      rainGlassStyle:
        rawMotionSettings.rainGlassStyle === "drizzle" ||
        rawMotionSettings.rainGlassStyle === "storm" ||
        rawMotionSettings.rainGlassStyle === "neon"
          ? rawMotionSettings.rainGlassStyle
          : undefined,
    };
    const safeBackgroundMediaType = backgroundMediaType === "video" ? "video" : "image";
    const hasBackgroundMedia = Boolean(safeBackground || safeBackgroundVideo);
    const safeBackgroundType = safeMotion ? "animation" : backgroundType;

    if (isPhotoAnimationType((safeMotion ? `${safeMotion}Motion` : safeAnimationType) as AnimationType | null) && !hasBackgroundMedia) {
      return NextResponse.json(
        { error: "This motion requires a background image." },
        { status: 400 }
      );
    }

    const overlayError = getOverlayTierError(safeOverlay);
    if (overlayError) {
      return NextResponse.json({ error: overlayError }, { status: 403 });
    }

    if (safeOverlay && !hasBackgroundMedia) {
      return NextResponse.json(
        { error: "Overlay effects require a background image." },
        { status: 400 }
      );
    }

    // Validate only static animation type keys at the API layer.
    // Motion keys are controlled separately and are not part of AnimationType.
    const animationError = getAnimationTierError(safeAnimationType);
    if (animationError) {
      return NextResponse.json(
        { error: animationError },
        { status: 403 }
      );
    }

    const motionError = getMotionTierError(safeMotion, safeBackgroundMediaType);
    if (motionError) {
      return NextResponse.json(
        { error: motionError },
        { status: 403 }
      );
    }

    const safeSpeed = typeof (speed ?? animationSpeed) === "number"
      ? Math.min(10, Math.max(1, Math.round((speed ?? animationSpeed) as number)))
      : undefined;
    const safeIntensity = typeof (intensity ?? animationIntensity) === "number"
      ? Math.min(10, Math.max(1, Math.round((intensity ?? animationIntensity) as number)))
      : undefined;

    const config = {
      primaryColor, textColor, background: safeBackground, animation,
      backgroundType: safeBackgroundType,
      motion: safeMotion ?? undefined,
      overlay: safeOverlay ?? undefined,
      lighting: safeLighting ?? undefined,
      speed: safeSpeed,
      intensity: safeIntensity,
      cardBgMode,
      cardBackground,
      cardGradientFrom, cardGradientTo, cardGradientDir,
      cardImage, cardOverlay,
      backgroundMediaType: safeBackgroundMediaType,
      backgroundVideo: safeBackgroundVideo,
      backgroundVideoPoster: safeBackgroundVideoPoster,
      backgroundVideoDuration: safeBackgroundVideoDuration,
      motionSettings: safeMotionSettings,
    };

    const requestedCategoryId = typeof body.category_id === "string" && body.category_id.trim()
      ? body.category_id.trim()
      : null;

    let selectedCategoryId: string | null = null;
    if (requestedCategoryId) {
      const { data: selectedCategory } = await supabaseAdmin
        .from("theme_categories")
        .select("id")
        .eq("id", requestedCategoryId)
        .maybeSingle();
      if (!selectedCategory) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      selectedCategoryId = selectedCategory.id;
    }

    const detectedSlug = detectThemeCategorySlug(config as Record<string, unknown>);
    let detectedCategoryId: string | null = null;
    if (detectedSlug) {
      const { data: detectedCategory } = await supabaseAdmin
        .from("theme_categories")
        .select("id")
        .eq("slug", detectedSlug)
        .maybeSingle();
      detectedCategoryId = detectedCategory?.id ?? null;
    }

    const finalCategoryId = detectedCategoryId ?? selectedCategoryId;

    // ── Optional base/upgrade pricing + visibility ──────────────────────────
    const rawBasePrice = body.base_price !== undefined
      ? Number(body.base_price)
      : (body.price !== undefined ? Number(body.price) : null);
    const basePrice: number | null = rawBasePrice !== null && Number.isFinite(rawBasePrice) && rawBasePrice > 0
      ? Math.round(rawBasePrice * 100) / 100
      : null;

    const rawUpgradePrice = body.upgrade_price !== undefined ? Number(body.upgrade_price) : null;
    const upgradePrice: number | null = rawUpgradePrice !== null && Number.isFinite(rawUpgradePrice) && rawUpgradePrice > 0
      ? Math.round(rawUpgradePrice * 100) / 100
      : null;

    if (basePrice !== null && upgradePrice !== null && upgradePrice > basePrice) {
      return NextResponse.json({ error: "Upgrade price cannot exceed base price" }, { status: 400 });
    }

    const isPublic = body.is_public === true;

    // ── Fetch store early so we can gate marketplace listing ───────────────
    const { data: creatorStore } = await supabaseAdmin
      .from("creator_stores")
      .select("id, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    // ── Require active store subscription to list in marketplace ───────────
    if (isPublic && !creatorStore?.is_active) {
      return NextResponse.json(
        { error: "An active store subscription is required to list themes in the Theme Store." },
        { status: 403 }
      );
    }

    const linkedStoreId = isPublic && creatorStore?.is_active ? creatorStore.id : null;

    // ── Insert theme ────────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from("themes")
      .insert([{ user_id: userId, name, config, price: basePrice, base_price: basePrice, upgrade_price: upgradePrice, is_public: isPublic, is_market_active: isPublic && creatorStore?.is_active === true, store_id: linkedStoreId, category_id: finalCategoryId }])
      .select("id, name, config, is_active, created_at, price, base_price, upgrade_price, is_public, unlock_count, is_market_active, version, parent_theme_id, category_id, is_verified")
      .single();

    if (error) {
      console.error("themes/create:", error);
      return NextResponse.json({ error: "Failed to save theme. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ theme: data });
  } catch (err) {
    console.error("themes/create unexpected:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
