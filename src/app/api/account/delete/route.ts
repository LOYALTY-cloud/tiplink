import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import type { ProfileRow, WalletRow } from "@/types/db";
import { stripe } from "@/lib/stripe/server";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice("Bearer ".length);

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken as string);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userRes.user;

    // ── Server-side password re-verification ──────────────────────
    let password: string | undefined;
    try {
      const body = await req.clone().json();
      password = body?.password;
    } catch {
      // no body — backwards compat, will fail below
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password confirmation required" }, { status: 400 });
    }

    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { error: pwErr } = await verifyClient.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (pwErr) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_account_id, owed_balance")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) {
      return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
    }

    const stripeAccountId = profile?.stripe_account_id ?? null;

    // Check wallet balances first
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance, withdraw_fee")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    if (walletErr) {
      return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
    }

    const balance = Number(wallet?.balance ?? 0);
    const owedBalance = Number((profile as any)?.owed_balance ?? 0);

    if (balance > 0 || owedBalance > 0) {
      return NextResponse.json(
        {
          error: balance > 0
            ? "You can't delete your account while you have a remaining balance. Please withdraw your funds first."
            : "You can't delete your account while you have an outstanding balance owed. Please contact support.",
          details: { balance, owedBalance },
        },
        { status: 409 }
      );
    }

    // Check pending withdrawals
    const { data: pendingWithdrawals, error: wErr } = await supabaseAdmin
      .from("withdrawals")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .limit(1);

    if (wErr) {
      return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
    }

    if (pendingWithdrawals && pendingWithdrawals.length > 0) {
      return NextResponse.json(
        { error: "You can’t delete your account while a withdrawal is in progress." },
        { status: 409 }
      );
    }

    if (stripeAccountId) {
      try {
        await stripe.accounts.del(stripeAccountId);
      } catch (e: unknown) {
        console.error("Stripe account deletion failed:", e);
        return NextResponse.json(
          {
            error:
              "Stripe account could not be deleted yet. If there are pending funds/payouts, try again after settlement.",
          },
          { status: 409 }
        );
      }
    }

    // Clean up application data before deleting auth user
    const profileId = profile?.id;
    await Promise.allSettled([
      supabaseAdmin.from("login_logs").delete().eq("user_id", user.id),
      supabaseAdmin.from("notifications").delete().eq("user_id", user.id),
      supabaseAdmin.from("user_settings").delete().eq("user_id", user.id),
      supabaseAdmin.from("goals").delete().eq("user_id", user.id),
      supabaseAdmin.from("theme_purchases").delete().eq("user_id", user.id),
      supabaseAdmin.from("transactions_ledger").delete().eq("user_id", user.id),
      supabaseAdmin.from("payout_methods").delete().eq("user_id", user.id),
      supabaseAdmin.from("withdrawals").delete().eq("user_id", user.id),
      supabaseAdmin.from("tip_intents").delete().eq("creator_user_id", user.id),
      supabaseAdmin.from("wallets").delete().eq("user_id", user.id),
      // FK to auth.users without ON DELETE CASCADE — must be removed before deleteUser
      supabaseAdmin.from("user_baselines").delete().eq("user_id", user.id),
      supabaseAdmin.from("fraud_cases").delete().eq("user_id", user.id),
      supabaseAdmin.from("ledger_anomalies").delete().eq("user_id", user.id),
      supabaseAdmin.from("admin_access_logs").delete().eq("user_id", user.id),
      supabaseAdmin.from("vanity_handles").delete().eq("owner_id", user.id),
      ...(profileId
        ? [supabaseAdmin.from("social_links").delete().eq("profile_id", profileId)]
        : []),
      supabaseAdmin.from("profiles").delete().eq("user_id", user.id),
    ]);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
  }
}
