import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;
    const { payment_intent_id } = await req.json();

    if (!payment_intent_id) {
      return NextResponse.json({ error: "Missing payment_intent_id" }, { status: 400 });
    }

    const { stripe } = await import("@/lib/stripe/server");

    // Always re-fetch from Stripe — never trust client status
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (intent.status !== "succeeded") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    const meta = intent.metadata ?? {};
    if (meta.type !== "legacy_theme_purchase") {
      return NextResponse.json({ error: "Wrong payment type" }, { status: 400 });
    }
    if (meta.user_id !== userId) {
      return NextResponse.json({ error: "User mismatch" }, { status: 403 });
    }

    const theme = meta.theme;
    if (!theme) {
      return NextResponse.json({ error: "No theme in payment metadata" }, { status: 400 });
    }

    // Idempotent upsert — safe to call multiple times
    const { error: upsertErr } = await supabaseAdmin
      .from("theme_purchases")
      .upsert(
        { user_id: userId, theme, stripe_session_id: payment_intent_id, amount: intent.amount },
        { onConflict: "user_id,theme", ignoreDuplicates: true }
      );

    if (upsertErr) {
      console.error("confirm-legacy-purchase: upsert error", upsertErr);
      return NextResponse.json({ error: "Failed to record purchase" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, theme });
  } catch (e: unknown) {
    console.error("confirm-legacy-purchase", e);
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
