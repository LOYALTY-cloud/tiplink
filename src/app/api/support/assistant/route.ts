import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appMap } from "@/lib/appMap";
import { getAIReply } from "@/lib/aiSupport";
import { analyzeEscalation, triggerEscalation } from "@/lib/support/escalation";

type Action = { label: string; href: string };

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, sessionId, failCount = 0, messageCount = 0 } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Log the question (fire-and-forget)
  supabaseAdmin.from("support_logs").insert({ user_id: user.id, message }).then(() => {});

  const lower = message.toLowerCase();

  // Fetch user context in parallel
  const [profileRes, walletRes, lastTxRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_enabled")
      .eq("user_id", user.id)
      .single(),
    supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single(),
    supabaseAdmin
      .from("transactions_ledger")
      .select("type, amount, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const wallet = walletRes.data;
  const bal = Number(wallet?.balance ?? 0);
  const lastTx = lastTxRes.data;

  // --- Withdraw / payout ---
  if (lower.includes("withdraw") || lower.includes("payout") || lower.includes("cash out")) {
    if (!profile?.stripe_account_id) {
      return replyWithEscalation(
        "You haven't connected a payout account yet. Let's get that set up so you can start withdrawing.",
        { label: "Enable payouts", href: appMap.wallet.path },
      );
    }
    if (!profile?.stripe_payouts_enabled) {
      return replyWithEscalation(
        "Your Stripe account is connected, but onboarding isn't finished yet. Complete it to unlock withdrawals.",
        { label: "Complete onboarding", href: appMap.onboarding.path },
      );
    }
    if (bal <= 0) {
      return replyWithEscalation(
        `Your current balance is $${bal.toFixed(2)}, so there's nothing to withdraw yet. Once you receive tips, you'll be able to cash out.`,
        { label: "Share your tip link", href: appMap.share.path },
      );
    }
    return replyWithEscalation(
      `You're all set! Your balance is $${bal.toFixed(2)}. Head to your Wallet to withdraw.`,
      { label: "Go to Wallet", href: appMap.wallet.path },
    );
  }

  // --- Balance ---
  if (lower.includes("balance") || lower.includes("how much")) {
    return replyWithEscalation(
      `Your current wallet balance is $${bal.toFixed(2)}.`,
      { label: "View Wallet", href: appMap.wallet.path },
    );
  }

  // --- Missing money ---
  if (lower.includes("missing") || lower.includes("not received") || lower.includes("didn't get")) {
    return replyWithEscalation(
      "If a tip seems missing, check your Transactions page — it may be processing. If it's not there after a few minutes, let us know.",
      { label: "View Transactions", href: appMap.transactions.path },
    );
  }

  // --- Fees ---
  if (lower.includes("fee") || lower.includes("charge") || lower.includes("why was i charged")) {
    return replyWithEscalation("Tips include a 2.9% + $0.30 processing fee (Stripe) and a 1.1% platform fee. These are shown to the tipper before they confirm.");
  }

  // --- Refund ---
  if (lower.includes("refund") || lower.includes("money back")) {
    if (lastTx?.type === "refund") {
      return replyWithEscalation(
        `Your most recent transaction is a refund for $${Number(lastTx.amount).toFixed(2)}. It may take a few business days to fully process.`,
        { label: "View Transactions", href: appMap.transactions.path },
      );
    }
    return replyWithEscalation("Refunds are handled by the admin team. If your refund is pending, it may take a few business days to complete.");
  }

  // --- Last transaction ---
  if (lower.includes("last transaction") || lower.includes("last tip") || lower.includes("recent")) {
    if (!lastTx) {
      return replyWithEscalation(
        "You don't have any transactions yet. Share your link to start receiving tips!",
        { label: "Share your link", href: appMap.share.path },
      );
    }
    const date = new Date(lastTx.created_at).toLocaleDateString();
    return replyWithEscalation(
      `Your last transaction was a ${lastTx.type.replace(/_/g, " ")} for $${Number(lastTx.amount).toFixed(2)} on ${date}.`,
      { label: "View all transactions", href: appMap.transactions.path },
    );
  }

  // --- Goal ---
  if (lower.includes("goal")) {
    return replyWithEscalation(
      "You can set an earnings goal from your Earnings page. It tracks tips since the goal start date with a live progress ring.",
      { label: "Set a goal", href: appMap.earnings.path },
    );
  }

  // --- Stripe / onboarding ---
  if (lower.includes("stripe") || lower.includes("onboarding") || lower.includes("connect")) {
    if (profile?.stripe_payouts_enabled) {
      return replyWithEscalation("Your Stripe account is fully connected and payouts are enabled. You're all set!");
    }
    if (profile?.stripe_account_id) {
      return replyWithEscalation(
        "Your Stripe account is connected but onboarding isn't complete yet. Finish it to start receiving payouts.",
        { label: "Complete onboarding", href: appMap.onboarding.path },
      );
    }
    return replyWithEscalation(
      "To receive payouts, you need to connect Stripe. It only takes a few minutes.",
      { label: "Connect Stripe", href: appMap.wallet.path },
    );
  }

  // --- Password ---
  if (lower.includes("password") || lower.includes("reset password") || lower.includes("forgot")) {
    return replyWithEscalation(
      "To reset your password, go to the login page and click 'Forgot password'. You'll get a reset link via email.",
      { label: "Reset password", href: appMap.resetPassword.path },
    );
  }

  // --- Profile ---
  if (lower.includes("profile") || lower.includes("edit profile") || lower.includes("handle")) {
    return replyWithEscalation(
      "You can update your display name, handle, bio, and profile image from your Profile page.",
      { label: "Edit Profile", href: appMap.profile.path },
    );
  }

  // --- Share ---
  if (lower.includes("share") || lower.includes("my link") || lower.includes("qr")) {
    return replyWithEscalation(
      "Your tip link is your profile URL. You can copy it or generate a QR code from the Share page.",
      { label: "Share your link", href: appMap.share.path },
    );
  }

  // --- Notification ---
  if (lower.includes("notification") || lower.includes("alert") || lower.includes("bell")) {
    return replyWithEscalation("Notifications appear in the bell icon at the top of your dashboard. You'll get alerts for new tips, goal completions, and more.");
  }

  // --- Account deletion ---
  if (lower.includes("delete account") || lower.includes("close account")) {
    return replyWithEscalation(
      "To delete your account, go to Settings → scroll to the bottom → Delete Account. This is permanent and can't be undone.",
      { label: "Go to Settings", href: appMap.settings.path },
    );
  }

  // --- Tip ---
  if (lower.includes("tip") || lower.includes("send tip") || lower.includes("how to tip")) {
    return replyWithEscalation("To tip someone, visit their profile page and enter an amount. You can pay with any card — no account needed.");
  }

  // --- Fallback → AI ---
  try {
    const userContext = {
      balance: bal,
      payouts_enabled: profile?.stripe_payouts_enabled ?? false,
      stripe_connected: !!profile?.stripe_account_id,
      last_transaction: lastTx?.type ?? null,
    };
    const aiResult = await getAIReply(message, userContext);

    // Run escalation check on fallback too
    const escalation = analyzeEscalation(message, failCount, messageCount);
    let escalationOutcome = null;
    if (escalation.shouldEscalate && sessionId) {
      escalationOutcome = await triggerEscalation(
        sessionId,
        escalation.reasons,
        escalation.topReason,
        escalation.confidence,
      );
    }

    return NextResponse.json({
      ...aiResult,
      ...(escalation.shouldEscalate && {
        escalation: {
          triggered: escalationOutcome?.escalated ?? false,
          reason: escalation.topReason,
          confidence: escalation.confidence,
          adminAssigned: escalationOutcome?.adminAssigned ?? false,
          adminName: escalationOutcome?.adminName ?? null,
          cooldown: escalationOutcome?.cooldown ?? false,
        },
      }),
    });
  } catch (e) {
    console.error("[support] AI fallback failed:", e);
    return replyWithEscalation("I'm not sure about that yet. Try asking about withdrawals, balance, fees, transactions, or your account.");
  }

  // Helper: build response with optional escalation check
  async function replyWithEscalation(text: string, action?: Action) {
    const escalation = analyzeEscalation(message, failCount, messageCount);
    const actions = action ? [action] : undefined;

    let escalationOutcome = null;
    if (escalation.shouldEscalate && sessionId) {
      escalationOutcome = await triggerEscalation(
        sessionId,
        escalation.reasons,
        escalation.topReason,
        escalation.confidence,
      );
    }

    return NextResponse.json({
      reply: text,
      ...(actions && { actions }),
      ...(escalation.shouldEscalate && {
        escalation: {
          triggered: escalationOutcome?.escalated ?? false,
          reason: escalation.topReason,
          confidence: escalation.confidence,
          adminAssigned: escalationOutcome?.adminAssigned ?? false,
          adminName: escalationOutcome?.adminName ?? null,
          cooldown: escalationOutcome?.cooldown ?? false,
        },
      }),
    });
  }
}

function reply(text: string, action?: Action) {
  const actions = action ? [action] : undefined;
  return NextResponse.json({ reply: text, ...(actions && { actions }) });
}
