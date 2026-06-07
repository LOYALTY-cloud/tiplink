import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, "revenue"); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("wallet_stripe_discrepancies")
    .select("user_id, stripe_account_id, our_balance, stripe_balance, drift, direction, detected_at, resolved")
    .order("detected_at", { ascending: false })
    .limit(100);

  if (error) {
    // Table may not exist yet — return empty gracefully
    return NextResponse.json({ discrepancies: [] });
  }

  // Enrich with handle/display_name
  const userIds = (data ?? []).map((d) => d.user_id as string);
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from("profiles").select("user_id, handle, display_name").in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const discrepancies = (data ?? []).map((d) => ({
    ...d,
    handle: profileMap.get(d.user_id as string)?.handle ?? d.user_id,
    display_name: profileMap.get(d.user_id as string)?.display_name ?? "",
  }));

  return NextResponse.json({ discrepancies });
}

// Mark a discrepancy as resolved
export async function PATCH(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { requireRole(session.role, "revenue"); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { user_id, resolution_note } = await req.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("wallet_stripe_discrepancies")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: session.userId,
      resolution_note: resolution_note ?? "Resolved by admin",
    })
    .eq("user_id", user_id);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
