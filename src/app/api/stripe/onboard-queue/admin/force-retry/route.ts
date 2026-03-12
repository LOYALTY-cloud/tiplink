import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromSession } from "@/lib/auth/getAdminFromSession";

const LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Missing access token" }, { status: 401 });

    const admin_id = await getAdminFromSession(token);
    if (!admin_id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Fetch the row
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from("stripe_onboard_queue")
      .select("*")
      .eq("user_id", user_id)
      .limit(1)
      .single();

    if (fetchError) return NextResponse.json({ error: (fetchError as unknown).message }, { status: 500 });

    if (!rows) {
      return NextResponse.json({ error: "No queue row found for this user" }, { status: 404 });
    }

    // Only force retry if row is not already processing or already succeeded
    if (rows.status === "processing" || rows.status === "success") {
      return NextResponse.json({ message: `Row is currently ${rows.status}, cannot force retry` }, { status: 400 });
    }

    // Update row to pending and reset retry_count
    const { error: updateError } = await supabaseAdmin
      .from("stripe_onboard_queue")
      .update({
        status: "pending",
        retry_count: 0,
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    if (updateError) return NextResponse.json({ error: (updateError as unknown).message }, { status: 500 });

    // Best-effort: record admin action in stripe_onboard_admin_logs if table exists
    try {
      await supabaseAdmin.from("stripe_onboard_admin_logs").insert({
        user_id,
        admin_id,
        action: "force_retry",
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Failed to write admin log (non-fatal):", e);
    }

    return NextResponse.json({ message: "Force retry applied successfully" });
  } catch (err: unknown) {
    console.error("Force retry error:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
