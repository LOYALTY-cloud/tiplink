import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireRole(session.role, "view_admin");

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "pending";

    const { data, error } = await supabaseAdmin
      .from("identity_verifications")
      .select("id, user_id, status, document_url, document_back_url, document_path, document_back_path, document_type, submitted_at, reviewed_at, reviewed_by, rejection_reason, ocr_data, match_score")
      .eq("status", statusFilter)
      .order("submitted_at", { ascending: true })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch user profiles for display
    const userIds = [...new Set((data ?? []).map((v) => v.user_id))];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, handle, display_name, email, avatar_url, account_status")
          .in("user_id", userIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    // Generate signed URLs for document viewing (60s expiry)
    const enriched = await Promise.all(
      (data ?? []).map(async (v) => {
        let signedFront: string | null = null;
        let signedBack: string | null = null;

        const frontPath = v.document_path || v.document_url;
        if (frontPath) {
          const { data: sf } = await supabaseAdmin.storage
            .from("kyc-documents")
            .createSignedUrl(frontPath, 60);
          signedFront = sf?.signedUrl ?? null;
        }

        const backPath = v.document_back_path || v.document_back_url;
        if (backPath) {
          const { data: sb } = await supabaseAdmin.storage
            .from("kyc-documents")
            .createSignedUrl(backPath, 60);
          signedBack = sb?.signedUrl ?? null;
        }

        return {
          ...v,
          signed_document_url: signedFront,
          signed_document_back_url: signedBack,
          user: profileMap.get(v.user_id) ?? null,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
