import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const RETENTION_DAYS = 30;
const BUCKET = "kyc-documents";

/**
 * Cleanup cron: delete rejected verification docs older than 30 days.
 * Call via Vercel Cron or external scheduler with:
 *   GET /api/cron/cleanup-verifications?key=YOUR_CRON_SECRET
 */
export async function GET(req: Request) {
  // Simple secret-based auth for cron
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  // Find old rejected verifications with stored document paths
  const { data: stale, error } = await supabaseAdmin
    .from("identity_verifications")
    .select("id, document_path, document_back_path")
    .eq("status", "rejected")
    .lt("reviewed_at", cutoff.toISOString())
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let deleted = 0;

  for (const v of stale ?? []) {
    const paths: string[] = [];
    if (v.document_path) paths.push(v.document_path);
    if (v.document_back_path) paths.push(v.document_back_path);

    // Delete files from storage
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }

    // Clear paths from DB record (keep record for audit, remove doc refs)
    await supabaseAdmin
      .from("identity_verifications")
      .update({
        document_url: null,
        document_back_url: null,
        document_path: null,
        document_back_path: null,
      })
      .eq("id", v.id);

    deleted++;
  }

  return NextResponse.json({
    ok: true,
    cleaned: deleted,
    cutoff: cutoff.toISOString(),
  });
}
