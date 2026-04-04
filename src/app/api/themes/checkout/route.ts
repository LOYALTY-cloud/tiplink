import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { THEME_KEYS, type ThemeKey } from "@/lib/themes";

const THEME_PRICE = 199; // $1.99
const BUNDLE_PRICE = 499; // $4.99
const FREE_THEMES: string[] = ["default", "dark"];

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;
    const { theme } = await req.json();

    // Validate theme
    if (!theme || (theme !== "all" && !THEME_KEYS.includes(theme as ThemeKey))) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    }

    // Don't charge for free themes
    if (FREE_THEMES.includes(theme)) {
      return NextResponse.json({ error: "This theme is free" }, { status: 400 });
    }

    // Check if already purchased
    const { data: existing } = await supabaseAdmin
      .from("theme_purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("theme", theme)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Theme already unlocked" }, { status: 400 });
    }

    // Also check if user already owns "all" bundle
    if (theme !== "all") {
      const { data: bundle } = await supabaseAdmin
        .from("theme_purchases")
        .select("id")
        .eq("user_id", userId)
        .eq("theme", "all")
        .maybeSingle();

      if (bundle) {
        return NextResponse.json({ error: "You already have the bundle — all themes unlocked" }, { status: 400 });
      }
    }

    const { stripe } = await import("@/lib/stripe/server");

    const isBundle = theme === "all";
    const price = isBundle ? BUNDLE_PRICE : THEME_PRICE;
    const productName = isBundle ? "Theme Bundle: Unlock All" : `Theme Unlock: ${theme}`;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: productName },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        theme,
        type: "theme_purchase",
      },
      success_url: `${siteUrl}/dashboard/account?theme_success=true`,
      cancel_url: `${siteUrl}/dashboard/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    console.error("Theme checkout error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
