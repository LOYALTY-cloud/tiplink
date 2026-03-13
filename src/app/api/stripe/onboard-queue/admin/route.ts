import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function GET() {
  try {
    const now = new Date();
    const lockThreshold = new Date(now.getTime() - LOCK_TTL_MS);

    const { data, error } = await supabaseAdmin
      .from("stripe_onboard_queue")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      const msg = error instanceof Error ? error.message : String(error ?? "");
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rows = (data || []).map((row: any) => ({
      user_id: row.user_id,
      status: row.status,
      retry_count: row.retry_count,
      processing_started_at: row.processing_started_at,
      updated_at: row.updated_at,
      stuck: row.status === "processing" && new Date(row.processing_started_at) <= lockThreshold,
    }));

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    console.error("Error fetching onboard queue admin view:", err);
    const errMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
