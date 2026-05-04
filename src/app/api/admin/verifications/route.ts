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
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
    const pageSize = 25;

    // Parallel: fetch page of items + all three tab counts
    const [itemsResult, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      supabaseAdmin
        .from("identity_verifications")
        .select("id, user_id, status, document_url, document_back_url, document_path, document_back_path, document_type, submitted_at, reviewed_at, reviewed_by, rejection_reason, ocr_data, match_score")
        .eq("status", statusFilter)
        .order("submitted_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1),
      supabaseAdmin.from("identity_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("identity_verifications").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin.from("identity_verifications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

    if (itemsResult.error) return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
    const data = itemsResult.data ?? [];

    // Fetch user profiles for display
    const userIds = [...new Set(data.map((v) => v.user_id))];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, handle, display_name, email, avatar_url, account_status")
          .in("user_id", userIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    // Fetch reviewer names for reviewed items
    const reviewerIds = [...new Set(data.filter((v) => v.reviewed_by).map((v) => v.reviewed_by!))];
    const { data: reviewerAdmins } = reviewerIds.length
      ? await supabaseAdmin
          .from("admins")
          .select("user_id, full_name")
          .in("user_id", reviewerIds)
      : { data: [] };
    const reviewerMap = new Map((reviewerAdmins ?? []).map((a) => [a.user_id, a.full_name ?? "Admin"]));

    // Generate signed URLs for document viewing (60s expiry)
    const enriched = await Promise.all(
      data.map(async (v) => {
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
          reviewer_name: v.reviewed_by ? (reviewerMap.get(v.reviewed_by) ?? null) : null,
        };
      })
    );

    const counts = {
      pending: pendingCount.count ?? 0,
      approved: approvedCount.count ?? 0,
      rejected: rejectedCount.count ?? 0,
    };

    // Total for the current filter (for pagination)
    const total = counts[statusFilter as keyof typeof counts] ?? 0;

    return NextResponse.json({ data: enriched, counts, total, page, pageSize });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
