import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_RETRIES = 5;

export async function POST() {
  try {
    const { data: queue } = await supabaseAdmin
      .from("stripe_onboard_queue")
      .select("user_id, retry_count")
      .eq("status", "pending")
      .lt("retry_count", MAX_RETRIES)
      .limit(50);

    if (!queue || queue.length === 0) return NextResponse.json({ retried: 0 });

    let processed = 0;

    const LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

    for (const row of queue) {
      const userId = row.user_id as string;

      // Attempt to atomically claim a row if it's pending OR stuck in processing beyond TTL
      const staleIso = new Date(Date.now() - LOCK_TTL_MS).toISOString();
      const { data: updatedRow } = await supabaseAdmin
        .from("stripe_onboard_queue")
        .update({ status: "processing", processing_started_at: new Date(), updated_at: new Date() })
        .or(`status.eq.pending,processing_started_at.lte.${staleIso}`)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (!updatedRow) {
        // already being processed by another worker or not reclaimable
        continue;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/onboard-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });

        if (res.ok) {
          // success -> mark success
          await supabaseAdmin.from("stripe_onboard_queue").update({ status: "success", updated_at: new Date() }).eq("user_id", userId);
        } else {
          // failure -> increment retry_count and set pending or failed
          const text = await res.text();
          const { data: existing } = await supabaseAdmin.from("stripe_onboard_queue").select("retry_count").eq("user_id", userId).maybeSingle();
          const nextRetry = (existing?.retry_count ?? 0) + 1;
          const newStatus = nextRetry >= MAX_RETRIES ? "failed" : "pending";
          await supabaseAdmin.from("stripe_onboard_queue").update({ status: newStatus, retry_count: nextRetry, last_attempt: new Date(), error_text: text, updated_at: new Date() }).eq("user_id", userId);
        }

        processed++;
      } catch (err: unknown) {
        console.error(`Retry failed for ${userId}:`, err?.message || err);
        const { data: existing } = await supabaseAdmin.from("stripe_onboard_queue").select("retry_count").eq("user_id", userId).maybeSingle();
        const nextRetry = (existing?.retry_count ?? 0) + 1;
        const newStatus = nextRetry >= MAX_RETRIES ? "failed" : "pending";
        await supabaseAdmin.from("stripe_onboard_queue").update({ status: newStatus, retry_count: nextRetry, last_attempt: new Date(), error_text: err?.message ?? String(err), updated_at: new Date() }).eq("user_id", userId);
      }
    }

    return NextResponse.json({ retried: processed });
  } catch (err: unknown) {
    console.error("onboard-retry error", err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
