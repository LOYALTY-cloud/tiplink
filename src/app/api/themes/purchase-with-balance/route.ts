import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { THEME_KEYS, type ThemeKey, FREE_THEMES } from "@/lib/themes";

const THEME_PRICE_DOLLARS = 1.99;
const BUNDLE_PRICE_DOLLARS = 4.99;

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
    if (FREE_THEMES.includes(theme as ThemeKey)) {
      return NextResponse.json({ error: "This theme is free" }, { status: 400 });
    }

    const price = theme === "all" ? BUNDLE_PRICE_DOLLARS : THEME_PRICE_DOLLARS;

    // Single atomic RPC — row-level lock, balance check, ledger insert,
    // wallet recalc, and theme_purchases insert all in one transaction.
    const { data, error } = await supabaseAdmin.rpc("purchase_theme_with_balance", {
      p_user_id: userId,
      p_theme: theme,
      p_price_dollars: price,
    });

    if (error) {
      console.error("RPC error:", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    if (data?.error) {
      const status = data.error === "insufficient_balance" ? 400 : 400;
      return NextResponse.json(
        { error: data.error, balance: data.balance, required: data.required },
        { status }
      );
    }

    return NextResponse.json({ success: true, theme });
  } catch (e: unknown) {
    console.error("Theme balance purchase error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
