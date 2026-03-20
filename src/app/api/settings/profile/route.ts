import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;
const MAX_BIO = 160;
const MAX_DISPLAY_NAME = 50;

export async function PATCH(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Handle
    if (body.handle !== undefined) {
      const h = String(body.handle).trim().toLowerCase();
      if (!HANDLE_RE.test(h)) {
        return NextResponse.json(
          { error: "Handle must be 3-30 characters, letters/numbers/underscores only" },
          { status: 400 }
        );
      }

      // Check uniqueness
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("handle", h)
        .neq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
      }

      updates.handle = h;
    }

    // Display name
    if (body.display_name !== undefined) {
      const dn = String(body.display_name).trim();
      if (dn.length > MAX_DISPLAY_NAME) {
        return NextResponse.json(
          { error: `Display name must be ${MAX_DISPLAY_NAME} characters or less` },
          { status: 400 }
        );
      }
      updates.display_name = dn || null;
    }

    // Bio
    if (body.bio !== undefined) {
      const bio = String(body.bio).trim();
      if (bio.length > MAX_BIO) {
        return NextResponse.json(
          { error: `Bio must be ${MAX_BIO} characters or less` },
          { status: 400 }
        );
      }
      updates.bio = bio || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, updated: Object.keys(updates) });
  } catch (e: unknown) {
    return serverError(e);
  }
}

/* ── helpers ────────────────────────────────────────────── */

function extractToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

async function getUser(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function serverError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "Server error");
  return NextResponse.json({ error: msg }, { status: 500 });
}
