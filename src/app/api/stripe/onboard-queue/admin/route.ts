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

    if (error) return NextResponse.json({ error: (error as any).message }, { status: 500 });

    const rows = (data || []).map((row: any) => ({
      user_id: row.user_id,
      status: row.status,
      retry_count: row.retry_count,
      processing_started_at: row.processing_started_at,
      updated_at: row.updated_at,
      stuck: row.status === "processing" && new Date(row.processing_started_at) <= lockThreshold,
    }));

    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error("Error fetching onboard queue admin view:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
