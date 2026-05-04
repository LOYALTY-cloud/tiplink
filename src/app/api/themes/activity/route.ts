import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getAuthedUser(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_theme_activity")
    .select("action, category_slug, animation_type, creator_id, price, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("themes/activity GET:", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }

  return NextResponse.json({ activity: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { theme_id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const themeId = typeof body.theme_id === "string" ? body.theme_id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!themeId || !["view", "preview", "apply", "purchase", "favorite"].includes(action)) {
    return NextResponse.json({ error: "Invalid activity payload" }, { status: 400 });
  }

  const { data: theme, error: themeErr } = await supabaseAdmin
    .from("themes")
    .select("id, user_id, base_price, price, config, category:theme_categories(slug)")
    .eq("id", themeId)
    .maybeSingle();

  if (themeErr || !theme) {
    return NextResponse.json({ error: "Theme not found" }, { status: 404 });
  }

  const category = Array.isArray(theme.category) ? theme.category[0] : theme.category;
  const config = (theme.config ?? {}) as Record<string, unknown>;
  const animationType = typeof config.motion === "string"
    ? config.motion
    : typeof config.animationType === "string"
      ? config.animationType
      : typeof config.animation === "string"
        ? config.animation
        : null;

  const { error } = await supabaseAdmin.from("user_theme_activity").insert({
    user_id: user.id,
    theme_id: theme.id,
    creator_id: typeof theme.user_id === "string" ? theme.user_id : null,
    action,
    category_slug: category && typeof category === "object" && typeof (category as { slug?: unknown }).slug === "string"
      ? (category as { slug: string }).slug
      : null,
    animation_type: animationType,
    price: Number(theme.base_price ?? theme.price ?? 0),
  });

  if (error) {
    console.error("themes/activity POST:", error);
    return NextResponse.json({ error: "Failed to track activity" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}