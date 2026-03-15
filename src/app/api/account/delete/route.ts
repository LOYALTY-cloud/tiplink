import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/safeServerClient";
import type { ProfileRow, WalletRow } from "@/types/db";
import { stripe } from "@/lib/stripe/server";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessToken = authHeader.slice("Bearer ".length);

    const supabaseAdmin = getSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(accessToken as string);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userRes.user;

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle()
      .returns<ProfileRow | null>();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    const stripeAccountId = profile?.stripe_account_id ?? null;

    // Check wallet balances first
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("available, pending, withdraw_fee")
      .eq("user_id", user.id)
      .maybeSingle()
      .returns<WalletRow | null>();

    if (walletErr) {
      return NextResponse.json({ error: walletErr.message }, { status: 500 });
    }

    const available = Number(wallet?.available ?? 0);
    const pending = Number(wallet?.pending ?? 0);
    const withdrawFee = Number(wallet?.withdraw_fee ?? 0);

    if (available > 0 || pending > 0 || withdrawFee > 0) {
      return NextResponse.json(
        {
          error: "You can’t delete your account while you have a balance, pending funds, or fees owed.",
          details: { available, pending, withdrawFee },
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
      return NextResponse.json({ error: wErr.message }, { status: 500 });
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
        const stripeErrMsg = e instanceof Error ? e.message : String(e ?? "Stripe error");
        return NextResponse.json(
          {
            error:
              "Stripe account could not be deleted yet. If there are pending funds/payouts, try again after settlement.",
            stripeError: stripeErrMsg,
          },
          { status: 409 }
        );
      }
    }

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
