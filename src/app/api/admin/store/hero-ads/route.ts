import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type HeroMotion = "particlesSoft" | "moneyRain" | "heartbeat";
type HeroOverlay = "smoke" | "sparkle" | "dust";
type HeroLighting = "glow" | null;

type HeroAdInput = {
  title?: unknown;
  subtitle?: unknown;
  badge?: unknown;
  cta_label?: unknown;
  cta_href?: unknown;
  cta_external?: unknown;
  accent?: unknown;
  motion?: unknown;
  overlay?: unknown;
  lighting?: unknown;
  image_url?: unknown;
  is_active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  sort_order?: unknown;
};

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseOptionalTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Timestamp must be a string or null");
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error("Invalid timestamp value");
  return new Date(ms).toISOString();
}

function parseHeroPayload(input: HeroAdInput, forCreate: boolean) {
  const title = normalizeString(input.title);
  if (forCreate && !title) throw new Error("title is required");

  const subtitle = normalizeString(input.subtitle);
  const badge = normalizeString(input.badge, "Ad") || "Ad";
  const ctaLabel = normalizeString(input.cta_label, "Learn More") || "Learn More";
  const ctaHref = normalizeString(input.cta_href, "/store") || "/store";

  const motionRaw = normalizeString(input.motion, "particlesSoft") || "particlesSoft";
  const overlayRaw = normalizeString(input.overlay, "smoke") || "smoke";
  const lightingRaw = input.lighting == null || input.lighting === "" ? null : normalizeString(input.lighting);

  const allowedMotions: HeroMotion[] = ["particlesSoft", "moneyRain", "heartbeat"];
  const allowedOverlays: HeroOverlay[] = ["smoke", "sparkle", "dust"];

  if (!allowedMotions.includes(motionRaw as HeroMotion)) {
    throw new Error("Invalid motion value");
  }
  if (!allowedOverlays.includes(overlayRaw as HeroOverlay)) {
    throw new Error("Invalid overlay value");
  }
  if (lightingRaw !== null && lightingRaw !== "glow") {
    throw new Error("Invalid lighting value");
  }

  const hasStartsAt = Object.prototype.hasOwnProperty.call(input, "starts_at");
  const hasEndsAt = Object.prototype.hasOwnProperty.call(input, "ends_at");
  const startsAt = forCreate || hasStartsAt ? parseOptionalTimestamp(input.starts_at) : undefined;
  const endsAt = forCreate || hasEndsAt ? parseOptionalTimestamp(input.ends_at) : undefined;
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    throw new Error("starts_at must be before ends_at");
  }

  const payload: {
    title: string;
    subtitle: string;
    badge: string;
    cta_label: string;
    cta_href: string;
    cta_external: boolean;
    accent: string;
    motion: HeroMotion;
    overlay: HeroOverlay;
    lighting: HeroLighting;
    image_url: string | null;
    is_active: boolean;
    sort_order: number;
    updated_at: string;
    starts_at?: string | null;
    ends_at?: string | null;
  } = {
    title,
    subtitle,
    badge,
    cta_label: ctaLabel,
    cta_href: ctaHref,
    cta_external: input.cta_external === true,
    accent: normalizeString(input.accent, "#22d3ee") || "#22d3ee",
    motion: motionRaw as HeroMotion,
    overlay: overlayRaw as HeroOverlay,
    lighting: lightingRaw as HeroLighting,
    image_url: normalizeString(input.image_url) || null,
    is_active: input.is_active !== false,
    sort_order: typeof input.sort_order === "number" ? Math.trunc(input.sort_order) : 0,
    updated_at: new Date().toISOString(),
  };

  if (forCreate || hasStartsAt) payload.starts_at = startsAt ?? null;
  if (forCreate || hasEndsAt) payload.ends_at = endsAt ?? null;

  if (!forCreate) {
    return payload;
  }

  return {
    ...payload,
    title,
  };
}

export async function GET(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, "view_admin");

    const { data, error } = await supabaseAdmin
      .from("store_hero_ads")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: "Failed to load hero ads." }, { status: 500 });
    return NextResponse.json({ ads: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, ["owner", "super_admin"]);

    const body = (await req.json()) as HeroAdInput;
    const payload = parseHeroPayload(body, true);

    const { data, error } = await supabaseAdmin
      .from("store_hero_ads")
      .insert(payload)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Failed to create hero ad." }, { status: 500 });
    return NextResponse.json({ ad: data }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, ["owner", "super_admin"]);

    const body = (await req.json()) as HeroAdInput & { id?: unknown };
    if (typeof body.id !== "string" || !body.id.trim()) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const payload = parseHeroPayload(body, false);

    const { data, error } = await supabaseAdmin
      .from("store_hero_ads")
      .update(payload)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Failed to update hero ad." }, { status: 500 });
    return NextResponse.json({ ad: data });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(admin.role, ["owner", "super_admin"]);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin.from("store_hero_ads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Failed to delete hero ad." }, { status: 500 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
