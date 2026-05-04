import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateHandle, generateHandleSuggestions } from "@/lib/handleValidation";

export const runtime = "nodejs";

/**
 * GET /api/auth/check-handle?handle=bornreal
 * Real-time handle availability check with suggestions.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("handle") ?? "";

  const validation = validateHandle(raw);
  if (!validation.ok) {
    return NextResponse.json(
      { available: false, error: validation.error },
      { status: 200 }
    );
  }

  const handle = validation.handle;

  // Check if taken (case-insensitive)
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .ilike("handle", handle)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ available: true, handle });
  }

  // Handle is taken — generate suggestions and filter out taken ones
  const suggestions = generateHandleSuggestions(handle);
  const { data: takenRows } = await supabaseAdmin
    .from("profiles")
    .select("handle")
    .in("handle", suggestions);

  const takenSet = new Set(takenRows?.map((r) => r.handle) ?? []);
  const available = suggestions.filter((s) => !takenSet.has(s)).slice(0, 5);

  return NextResponse.json({
    available: false,
    handle,
    error: "Handle is already taken",
    suggestions: available,
  });
}
