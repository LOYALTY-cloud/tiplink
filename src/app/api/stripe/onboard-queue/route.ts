import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const enqueueUserId = body?.user_id as string | undefined;

    if (enqueueUserId) {
      // Enqueue a single user manually
      const { error } = await supabaseAdmin
        .from("stripe_onboard_queue")
        .upsert({
          user_id: enqueueUserId,
          status: "pending",
          retry_count: 0,
          updated_at: new Date(),
        })
        .eq("user_id", enqueueUserId);

      if (error) return NextResponse.json({ error: (error as unknown).message }, { status: 500 });
      return NextResponse.json({ success: true, enqueued: enqueueUserId });
    }

    // Retry processor logic: pick a pending or stale row
    const now = new Date();
    const lockThreshold = new Date(now.getTime() - LOCK_TTL_MS);

    // Claim a single row atomically
    const { data: row, error: claimError } = await supabaseAdmin
      .from("stripe_onboard_queue")
      .update({
        status: "processing",
        processing_started_at: now,
        updated_at: now,
      })
      .or(`status.eq.pending,processing_started_at.lte.${lockThreshold.toISOString()}`)
      .limit(1)
      .select("*")
      .single();

    if (claimError) return NextResponse.json({ error: (claimError as unknown).message }, { status: 500 });
    if (!row) return NextResponse.json({ success: true, message: "No pending rows" });

    const userId = row.user_id as string;

    // Duplicate-check: skip if Stripe account already exists
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .single();

    if (profileErr) {
      console.error("Failed to fetch profile for user", userId, profileErr);
      throw new Error((profileErr as unknown).message);
    }

    if (profile?.stripe_account_id) {
      console.log(`User ${userId} already has a Stripe account. Marking success.`);
      await supabaseAdmin
        .from("stripe_onboard_queue")
        .update({ status: "success", updated_at: new Date() })
        .eq("user_id", userId);
      return NextResponse.json({ success: true, skipped: userId });
    }

    // Call the existing onboarding API
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/onboard-user`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Onboard failed for user ${userId}:`, errText);

      // Increment retry count & set back to pending or failed
      const retryCount = (row.retry_count || 0) + 1;
      await supabaseAdmin
        .from("stripe_onboard_queue")
        .update({
          status: retryCount >= 5 ? "failed" : "pending",
          retry_count: retryCount,
          updated_at: new Date(),
        })
        .eq("user_id", userId);

      return NextResponse.json({ error: errText, retry_count: retryCount }, { status: 500 });
    }

    // Success: mark row as success
    await supabaseAdmin
      .from("stripe_onboard_queue")
      .update({ status: "success", updated_at: new Date() })
      .eq("user_id", userId);

    console.log(`Successfully onboarded user ${userId}`);
    return NextResponse.json({ success: true, user_id: userId });
  } catch (err: unknown) {
    console.error("Unexpected error in onboard-queue route:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
