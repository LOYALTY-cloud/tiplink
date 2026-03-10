import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple in-memory rate limiter (best-effort for this PR).
// In production prefer a distributed limiter like Upstash/Redis.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // requests per window per IP
const ipMap = new Map<string, number[]>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const arr = ipMap.get(ip) || [];
  const filtered = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  filtered.push(now);
  ipMap.set(ip, filtered);
  return filtered.length > RATE_LIMIT_MAX;
}

export async function POST(req: Request) {
  try {
    // Validate auth via bearer JWT
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

    // Validate user via anon client + JWT
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;

    // Rate limit by IP
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown") as string;
    if (isRateLimited(ip)) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    console.log("Creating card for user:", userId);

    // Enforce one card per user
    const { data: existing } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, message: "Card already exists", last4: existing[0].last4 || null });
    }

    // Create cardholder
    const { name, email } = await req.json();

    const cardholder = await stripe.issuing.cardholders.create({
      type: "individual",
      name: name || undefined,
      email: email || undefined,
    });

    // Create virtual card
    const card = await stripe.issuing.cards.create({
      cardholder: cardholder.id,
      currency: "usd",
      type: "virtual",
    });

    // Save card in database
    const { error: insertErr } = await supabaseAdmin.from("cards").insert({
      user_id: userId,
      stripe_cardholder_id: cardholder.id,
      stripe_card_id: card.id,
      brand: card.brand,
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      status: card.status,
    });

    if (insertErr) {
      // If unique constraint triggers, return success (idempotent)
      console.error("Card insert error:", insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, last4: card.last4 });
  } catch (err: any) {
    console.error("Card creation error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
