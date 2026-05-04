import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { THEME_KEYS, type ThemeKey } from "@/lib/themes";

const VALID_PACKS = ["army_pack", "imher_pack"];
const FREE_THEMES = ["default", "dark"];

function getPrice(theme: string): number {
  if (theme === "all") return 499;
  if (theme === "army_pack") return 299;
  if (theme === "imher_pack") return 499;
  return 199;
}

function getProductName(theme: string): string {
  if (theme === "all") return "Theme Bundle: Unlock All";
  if (theme === "army_pack") return "Theme Pack: Hustle Pack";
  if (theme === "imher_pack") return "Theme Pack: I'm Her Pack";
  return `Theme Unlock: ${theme}`;
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;
    const { theme } = await req.json();

    if (
      !theme ||
      (theme !== "all" && !VALID_PACKS.includes(theme) && !THEME_KEYS.includes(theme as ThemeKey))
    ) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    }

    if (FREE_THEMES.includes(theme)) {
      return NextResponse.json({ error: "This theme is free" }, { status: 400 });
    }

    // Idempotency: don't charge if already owned
    const { data: existing } = await supabaseAdmin
      .from("theme_purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("theme", theme)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Theme already unlocked" }, { status: 400 });
    }

    const { stripe } = await import("@/lib/stripe/server");

    const intent = await stripe.paymentIntents.create({
      amount: getPrice(theme),
      currency: "usd",
      description: getProductName(theme),
      metadata: {
        type: "legacy_theme_purchase",
        user_id: userId,
        theme,
      },
    });

    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
