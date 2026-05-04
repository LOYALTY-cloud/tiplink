import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveThemePrice } from "@/lib/themePricing";
import { addLedgerEntry } from "@/lib/ledger";
import { acquireWalletLock, releaseWalletLock } from "@/lib/walletLocks";

export const runtime = "nodejs";

const PLATFORM_FEE_RATE = 0.015; // 1.5% platform cut

export async function POST(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  // ── Input ────────────────────────────────────────────────────────────────
  let theme_id: unknown;
  try {
    ({ theme_id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof theme_id !== "string" || !theme_id.trim()) {
    return NextResponse.json({ error: "theme_id is required" }, { status: 400 });
  }

  // ── NEVER trust client price — load from DB ──────────────────────────────
  const { data: theme } = await supabaseAdmin
    .from("themes")
    .select(
      "id, user_id, name, price, base_price, upgrade_price, parent_theme_id, config, version, is_public, is_market_active"
    )
    .eq("id", theme_id)
    .eq("is_public", true)
    .or("is_market_active.eq.true,is_market_active.is.null")
    .maybeSingle();

  if (!theme) {
    return NextResponse.json({ error: "Theme not found or not listed for sale" }, { status: 404 });
  }

  const basePrice = Number(theme.base_price ?? theme.price ?? 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return NextResponse.json({ error: "This theme has no purchase price" }, { status: 400 });
  }
  if (theme.user_id === userId) {
    return NextResponse.json({ error: "You cannot purchase your own theme" }, { status: 400 });
  }

  // ── Already unlocked? (pre-lock fast check) ──────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("theme_unlocks")
    .select("id")
    .eq("user_id", userId)
    .eq("theme_id", theme_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, already_owned: true, theme_id });
  }

  // ── Resolve upgrade vs full price ────────────────────────────────────────
  const ownedRows = await supabaseAdmin
    .from("theme_unlocks")
    .select("theme_id")
    .eq("user_id", userId)
    .not("theme_id", "is", null);

  const ownedIds = new Set(
    (ownedRows.data ?? []).map((r) => r.theme_id as string).filter(Boolean)
  );

  const ancestorIds: string[] = [];
  let cursor = (theme.parent_theme_id as string | null) ?? null;
  let guard = 0;
  while (cursor && guard < 30) {
    ancestorIds.push(cursor);
    const { data: parent } = await supabaseAdmin
      .from("themes")
      .select("parent_theme_id")
      .eq("id", cursor)
      .maybeSingle();
    cursor = (parent?.parent_theme_id as string | null) ?? null;
    guard++;
  }

  const priceInfo = resolveThemePrice({
    basePrice,
    upgradePrice: typeof theme.upgrade_price === "number" ? theme.upgrade_price : null,
    isOwnedLatest: ownedIds.has(theme.id),
    qualifiesUpgrade: ancestorIds.some((id) => ownedIds.has(id)),
  });

  if (priceInfo.type === "owned") {
    return NextResponse.json({ success: true, already_owned: true, theme_id });
  }

  const price = priceInfo.price;
  const platformFee = Number((price * PLATFORM_FEE_RATE).toFixed(2));
  const creatorEarns = Number((price - platformFee).toFixed(2));
  const payoutSellerId = theme.user_id as string;

  // ── Acquire wallet lock before reading balance (prevents double-spend) ───
  const lock = await acquireWalletLock(supabaseAdmin, userId, "withdrawal", 60);
  if (!lock.ok) {
    return NextResponse.json(
      { error: "Wallet is busy. Please try again in a moment." },
      { status: 409 }
    );
  }

  try {
    // Re-check already_owned under lock (race guard)
    const { data: existingLocked } = await supabaseAdmin
      .from("theme_unlocks")
      .select("id")
      .eq("user_id", userId)
      .eq("theme_id", theme_id)
      .maybeSingle();

    if (existingLocked) {
      return NextResponse.json({ success: true, already_owned: true, theme_id });
    }

    // Read balance under lock
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    const balance = Number(wallet?.balance ?? 0);

    if (!Number.isFinite(balance) || balance < price) {
      // Insufficient funds — return info so UI can show card fallback
      return NextResponse.json({
        insufficient_balance: true,
        balance: Number(balance.toFixed(2)),
        price,
      });
    }

    // ── Deduct from wallet via ledger ──────────────────────────────────────
    await addLedgerEntry({
      user_id: userId,
      type: "theme_purchase",
      amount: -price,
      reference_id: theme_id,
      meta: {
        action: "theme_purchase",
        theme_id,
        theme_name: theme.name ?? null,
        seller_id: payoutSellerId,
        price,
        platform_fee: platformFee,
        creator_earnings: creatorEarns,
        payment_method: "wallet_balance",
      },
      status: "completed",
    });

    // ── Unlock theme ───────────────────────────────────────────────────────
    const { error: unlockErr } = await supabaseAdmin
      .from("theme_unlocks")
      .upsert(
        {
          user_id: userId,
          theme_id,
          creator_id: payoutSellerId,
          theme_name: theme.name ?? null,
          theme_config: theme.config ?? null,
          parent_theme_id: (theme.parent_theme_id as string | null) ?? null,
          theme_version: typeof theme.version === "number" ? theme.version : 1,
          unlocked_via: "payment",
          source: "payment",
          amount_paid: price,
        },
        { onConflict: "user_id,theme_id", ignoreDuplicates: true }
      );

    if (unlockErr) {
      console.error("buy-with-balance: theme_unlocks upsert error", unlockErr);
      // Ledger already debited — log and return error so user can retry
      return NextResponse.json({ error: "Failed to unlock theme. Please contact support." }, { status: 500 });
    }

    // ── Revenue record ─────────────────────────────────────────────────────
    // AWAITED — if this fails, creator won't get paid. Alert admin.
    // Insert (not upsert) since stripe_session_id is null for balance purchases.
    // The wallet lock prevents concurrent double-purchases for the same theme.
    const { error: salesErr } = await supabaseAdmin
      .from("theme_sales")
      .insert({
        theme_id,
        buyer_id: userId,
        seller_id: payoutSellerId,
        stripe_session_id: null,
        amount: price,
        platform_fee: platformFee,
        creator_earnings: creatorEarns,
      });

    if (salesErr) {
      console.error("buy-with-balance: theme_sales insert FAILED — creator earnings not recorded", {
        theme_id, buyerId: userId, sellerId: payoutSellerId, error: salesErr.message,
      });
      try {
        const { sendAdminAlert } = await import("@/lib/adminAlerts");
        sendAdminAlert({
          subject: "buy-with-balance: theme_sales insert failed",
          body: `Creator ${payoutSellerId} may be missing earnings for theme ${theme_id} (buyer ${userId}).`,
          severity: "critical",
          meta: { theme_id, buyerId: userId, sellerId: payoutSellerId, error: salesErr.message },
        });
      } catch (_) {}
    }

    // ── Activity log ───────────────────────────────────────────────────────
    void supabaseAdmin
      .from("user_theme_activity")
      .insert({
        user_id: userId,
        theme_id,
        creator_id: payoutSellerId,
        action: "purchase",
        price,
      });

    // ── Increment unlock counter ───────────────────────────────────────────
    void supabaseAdmin
      .rpc("increment_theme_unlock", { theme_id_input: theme_id });

    // ── Notifications (best-effort) ────────────────────────────────────────
    try {
      const { createNotification } = await import("@/lib/notifications");
      void createNotification({
        userId: payoutSellerId,
        type: "theme_sold",
        title: "Theme sold 🎉",
        body: `${theme.name ?? "Your theme"} was purchased`,
        category: "sales",
        actorId: userId,
        entityId: theme_id,
        meta: { amount: price },
      });
      void createNotification({
        userId,
        type: "theme_unlocked",
        title: "Theme unlocked 🎨",
        body: `${theme.name ?? "A theme"} has been added to your library`,
        category: "sales",
        actorId: payoutSellerId,
        entityId: theme_id,
      });
    } catch (_) {}

    return NextResponse.json({ success: true, theme_id });
  } finally {
    await releaseWalletLock(supabaseAdmin, userId, "withdrawal").catch(() => undefined);
  }
}
