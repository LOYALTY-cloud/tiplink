import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { appMap } from "@/lib/appMap";
import { getAIReply } from "@/lib/aiSupport";
import { analyzeEscalation, triggerEscalation } from "@/lib/support/escalation";
import { rateLimit } from "@/lib/rateLimit";

type Action = { label: string; href: string };

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 20 requests per 60 seconds per user
  const { allowed } = await rateLimit(`support-ai:${user.id}`, 20, 60);
  if (!allowed) {
    return NextResponse.json(
      { reply: "You're sending messages too quickly. Please wait a moment.", rateLimited: true },
      { status: 429 }
    );
  }

  let message: string, sessionId: string | undefined, failCount = 0, messageCount = 0;
  try {
    const body = await req.json();
    message = body.message;
    sessionId = body.sessionId;
    failCount = body.failCount ?? 0;
    messageCount = body.messageCount ?? 0;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
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
      .select("stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, account_status, restriction_reason, restricted_until, is_frozen, display_name, first_name")
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
  const firstName = profile?.first_name || profile?.display_name || null;
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  // --- Account status / restriction ---
  if (
    lower.includes("account status") ||
    lower.includes("restricted") ||
    lower.includes("suspended") ||
    lower.includes("frozen") ||
    lower.includes("why is my account") ||
    lower.includes("account blocked") ||
    lower.includes("account banned") ||
    lower.includes("account locked") ||
    lower.includes("can't use my account") ||
    lower.includes("cannot use my account")
  ) {
    const status = profile?.account_status ?? "active";
    const reason = profile?.restriction_reason ?? null;
    const frozen = profile?.is_frozen ?? false;
    const until = profile?.restricted_until
      ? new Date(profile.restricted_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

    if (frozen) {
      return replyWithEscalation(
        `${greeting}, I can see your account has been frozen. This usually happens when our system detects unusual activity that needs to be reviewed by our team. Unfortunately, I'm not able to unfreeze accounts directly — but I've flagged this for our support team and someone will be in touch with you shortly. In the meantime, if you believe this is a mistake, please reach out to us at support@1nelink.com and we'll get it sorted out as quickly as possible.`,
        { label: "Contact Support", href: appMap.settings.path },
      );
    }

    if (status === "suspended") {
      const reasonText = reason ? ` The reason on file is: "${reason}".` : " Our team will have more details.";
      return replyWithEscalation(
        `${greeting}, I can see your account has been suspended.${reasonText} Suspended accounts require a manual review from our team before they can be reinstated. Please email us at support@1nelink.com with your account details and we'll review your case as a priority. I've also flagged this conversation so a team member can follow up with you.`,
        { label: "Contact Support", href: appMap.settings.path },
      );
    }

    if (status === "restricted") {
      const reasonText = reason ? ` The reason on file is: "${reason}".` : "";
      const untilText = until ? ` This restriction is in place until ${until}.` : "";
      return replyWithEscalation(
        `${greeting}, your account is currently restricted.${reasonText}${untilText} While restricted, some features like payouts may be limited. To get this lifted, you can verify your identity or reach out to our support team — we're happy to walk you through it. If you believe this was applied in error, let us know and we'll look into it right away.`,
        { label: "Verify Identity", href: "/dashboard/account/verify" },
      );
    }

    // Active
    return replyWithEscalation(
      `${greeting}, your account is in good standing — everything looks active and healthy! Is there something specific you were concerned about? I'm happy to help.`,
      { label: "View Account", href: appMap.settings.path },
    );
  }

  // --- Withdraw / payout ---
  if (lower.includes("withdraw") || lower.includes("payout") || lower.includes("cash out")) {
    if (!profile?.stripe_account_id) {
      return replyWithEscalation(
        `${greeting}! To start withdrawing, you'll need to connect a payout account first — it only takes a few minutes through our Stripe onboarding. Once that's done, you'll be able to cash out directly to your bank. Want me to point you in the right direction?`,
        { label: "Set up payouts", href: appMap.wallet.path },
      );
    }
    if (!profile?.stripe_payouts_enabled) {
      return replyWithEscalation(
        `${greeting}, your Stripe account is connected but the onboarding isn't fully complete yet — that's what's holding up your withdrawals. Head over and finish the remaining steps, it usually takes just a couple of minutes. Let me know if you run into anything along the way!`,
        { label: "Complete onboarding", href: appMap.onboarding.path },
      );
    }
    if (bal <= 0) {
      return replyWithEscalation(
        `${greeting}, your payout account is fully set up — great! Your current balance is $${bal.toFixed(2)}, so there's nothing ready to withdraw just yet. Once you start receiving tips, the funds will show up here and you can cash out anytime.`,
        { label: "Share your tip link", href: appMap.share.path },
      );
    }
    return replyWithEscalation(
      `${greeting}, you're all set to withdraw! Your current balance is $${bal.toFixed(2)}. Head to your Wallet and hit the withdraw button — you can choose instant or standard transfer depending on how quickly you need it.`,
      { label: "Go to Wallet", href: appMap.wallet.path },
    );
  }

  // --- Balance ---
  if (lower.includes("balance") || lower.includes("how much")) {
    return replyWithEscalation(
      `${greeting}! Your current wallet balance is $${bal.toFixed(2)}. ${bal > 0 ? "You can withdraw that anytime from your Wallet." : "Once you start receiving tips, your balance will show up here."}`,
      { label: "View Wallet", href: appMap.wallet.path },
    );
  }

  // --- Missing money ---
  if (lower.includes("missing") || lower.includes("not received") || lower.includes("didn't get") || lower.includes("didnt get") || lower.includes("where is my")) {
    return replyWithEscalation(
      `${greeting}, I'm sorry to hear that — let's figure this out together. First, check your Transactions page to see if it shows as processing (this can take a few minutes). If it's been more than 10 minutes and still nothing, it's possible the payment didn't go through on the sender's end. If you have a receipt or confirmation, feel free to share it with our team and we'll trace it for you.`,
      { label: "View Transactions", href: appMap.transactions.path },
    );
  }

  // --- Fees ---
  if (lower.includes("fee") || lower.includes("why was i charged") || (lower.includes("charge") && !lower.includes("charges enabled"))) {
    return replyWithEscalation(`Great question! Here's a quick breakdown of the fees on 1neLink:\n\n• **Receiving tips**: Stripe charges 2.9% + $0.30 per transaction — we don't add any extra platform fee on top of that.\n• **Withdrawals**: If you choose instant transfer it's 5%, or standard transfer is 3.5% + $0.30. Both options are shown to you before you confirm so there are no surprises.\n\nIf you were charged something unexpected, let me know the details and I'll help you look into it!`);
  }

  // --- Refund ---
  if (lower.includes("refund") || lower.includes("money back") || lower.includes("get my money back")) {
    if (lastTx?.type === "refund" || lastTx?.type === "tip_refunded") {
      return replyWithEscalation(
        `${greeting}, I can see your most recent transaction is a refund for $${Number(lastTx.amount).toFixed(2)}. Refunds typically take 5–10 business days to appear back on your original payment method depending on your bank. If it's been longer than that, please reach out and we'll follow up with Stripe directly on your behalf.`,
        { label: "View Transactions", href: appMap.transactions.path },
      );
    }
    return replyWithEscalation(`${greeting}, refunds are processed by our admin team and typically take 5–10 business days to appear back on your original payment method. If you've already submitted a refund request, you'll get an update via email once it's been reviewed. If you haven't submitted one yet, I can help you get that started — just let me know!`);
  }

  // --- Last transaction ---
  if (lower.includes("last transaction") || lower.includes("last tip") || lower.includes("recent transaction") || lower.includes("transaction history")) {
    if (!lastTx) {
      return replyWithEscalation(
        `${greeting}, it looks like you don't have any transactions yet — your account is all set up and ready though! Once someone sends you a tip, it'll show up here. Want help sharing your tip link to get started?`,
        { label: "Share your link", href: appMap.share.path },
      );
    }
    const date = new Date(lastTx.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return replyWithEscalation(
      `${greeting}! Your most recent transaction was a ${lastTx.type.replace(/_/g, " ")} for $${Number(lastTx.amount).toFixed(2)} on ${date}. You can view your full history on the Transactions page.`,
      { label: "View all transactions", href: appMap.transactions.path },
    );
  }

  // --- Goal ---
  if (lower.includes("goal") || lower.includes("earnings target") || lower.includes("progress")) {
    return replyWithEscalation(
      `${greeting}! You can set an earnings goal right from your Earnings page. Once it's set, you'll see a live progress ring that tracks your tips from the day you started the goal — it's a great way to stay motivated. You can update or reset your goal at any time.`,
      { label: "Set a goal", href: appMap.earnings.path },
    );
  }

  // --- Stripe / onboarding ---
  if (lower.includes("stripe") || lower.includes("onboarding") || lower.includes("payout account") || lower.includes("bank account")) {
    if (profile?.stripe_payouts_enabled && profile?.stripe_charges_enabled) {
      return replyWithEscalation(`${greeting}, your Stripe account is fully connected and both charges and payouts are enabled — you're all set! If you ever need to update your bank details or personal info, you can manage that through your payout settings.`, { label: "Manage payout account", href: appMap.onboarding.path });
    }
    if (profile?.stripe_account_id && !profile?.stripe_payouts_enabled) {
      return replyWithEscalation(
        `${greeting}, your Stripe account is linked but the setup isn't fully complete yet — that's what's preventing payouts from going through. It usually just takes a few minutes to finish. Head to your onboarding page and follow the remaining steps. If you're stuck on a specific step, let me know and I'll help you through it!`,
        { label: "Complete onboarding", href: appMap.onboarding.path },
      );
    }
    return replyWithEscalation(
      `${greeting}! To receive payouts on 1neLink, you'll need to connect a Stripe account. It's quick — usually 2–5 minutes — and you'll just need your basic personal info and bank details handy. Once it's done, you can withdraw your tips directly to your bank.`,
      { label: "Connect Stripe", href: appMap.wallet.path },
    );
  }

  // --- Password ---
  if (lower.includes("password") || lower.includes("reset password") || lower.includes("forgot") || lower.includes("can't log in") || lower.includes("cant log in") || lower.includes("locked out")) {
    return replyWithEscalation(
      `${greeting}, no worries — resetting your password is easy! Just go to the login page and click "Forgot password". Enter your email and we'll send you a reset link right away. Check your spam folder if you don't see it within a minute or two. If you're still having trouble getting in, let me know and I'll get our team to help you out.`,
      { label: "Reset password", href: appMap.resetPassword.path },
    );
  }

  // --- Profile ---
  if (lower.includes("edit profile") || lower.includes("update profile") || lower.includes("change my handle") || lower.includes("change handle") || lower.includes("change my name") || lower.includes("profile picture") || lower.includes("profile photo") || lower.includes("bio")) {
    return replyWithEscalation(
      `${greeting}! You can update your display name, handle, bio, profile picture, banner image, and social links all from your Profile page. Just a heads up — your handle can only be changed once every 30 days, so choose carefully! Everything else you can update as often as you'd like.`,
      { label: "Edit Profile", href: appMap.profile.path },
    );
  }

  // --- Share ---
  if (lower.includes("share") || lower.includes("my link") || lower.includes("tip link") || lower.includes("qr code") || lower.includes("qr")) {
    return replyWithEscalation(
      `${greeting}! Your personal tip link is your profile URL — it's the easiest way for people to find and tip you. From the Share page, you can copy the link, download a QR code to print or post, or share it directly to social media. Put it in your bio, on your merch, or anywhere your audience can see it!`,
      { label: "Share your link", href: appMap.share.path },
    );
  }

  // --- Notification ---
  if (lower.includes("notification") || lower.includes("alert") || lower.includes("not getting notified") || lower.includes("no notification")) {
    return replyWithEscalation(`${greeting}! Notifications show up in the bell icon at the top of your dashboard. You'll get real-time alerts for new tips, goal completions, and important account updates. If you're not receiving notifications, make sure your browser has permission enabled for this site — sometimes that gets blocked by default.`);
  }

  // --- Account deletion ---
  if (lower.includes("delete account") || lower.includes("close account") || lower.includes("cancel my account") || lower.includes("deactivate")) {
    return replyWithEscalation(
      `${greeting}, I'm sorry to hear you want to leave! Before you go, if there's anything we can help fix or improve, please don't hesitate to let us know. If you do want to proceed, you can delete your account by going to Settings and scrolling to the bottom — there's a Delete Account option there. Please note this is permanent and cannot be undone, and any remaining balance would need to be withdrawn first.`,
      { label: "Go to Settings", href: appMap.settings.path },
    );
  }

  // --- Tip ---
  if (lower.includes("how to tip") || lower.includes("send a tip") || lower.includes("how do i send") || lower.includes("how do i tip")) {
    return replyWithEscalation(`${greeting}! Tipping on 1neLink is super easy — no account needed. Just visit the creator's profile page, enter the amount you'd like to send, and pay with any credit or debit card. The creator receives it directly. If you want to leave a message with your tip, there's a field for that too!`);
  }

  // --- Fallback → AI ---
  try {
    const userContext = {
      balance: bal,
      account_status: profile?.account_status ?? "active",
      restriction_reason: profile?.restriction_reason ?? null,
      is_frozen: profile?.is_frozen ?? false,
      payouts_enabled: profile?.stripe_payouts_enabled ?? false,
      charges_enabled: profile?.stripe_charges_enabled ?? false,
      stripe_connected: !!profile?.stripe_account_id,
      last_transaction: lastTx?.type ?? null,
      name: firstName,
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
