import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateHandle } from "@/lib/handleValidation";

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
      const validation = validateHandle(String(body.handle));
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const h = validation.handle;

      // Check if handle is currently locked (2-week lock after signup)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("handle, handle_locked_until")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile && profile.handle !== h) {
        if (profile.handle_locked_until) {
          const lockEnd = new Date(profile.handle_locked_until);
          if (lockEnd > new Date()) {
            const daysLeft = Math.ceil((lockEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            return NextResponse.json(
              { error: `Your handle is locked for ${daysLeft} more day${daysLeft !== 1 ? "s" : ""}. You can change it after ${lockEnd.toLocaleDateString()}.` },
              { status: 403 }
            );
          }
        }

        // Check uniqueness (case-insensitive)
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .ilike("handle", h)
          .neq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
        }

        // Lock handle for 2 weeks after change
        updates.handle_locked_until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
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

    // Location
    if (body.location !== undefined) {
      const loc = String(body.location).trim().slice(0, 100);
      updates.location = loc || null;
    }

    // Avatar URL
    if (body.avatar_url !== undefined) {
      updates.avatar_url = body.avatar_url ? String(body.avatar_url).trim() : null;
    }

    // Banner URL
    if (body.banner_url !== undefined) {
      updates.banner_url = body.banner_url ? String(body.banner_url).trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id)
      .select("handle, display_name, bio");

    if (error) {
      console.error("settings/profile update", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, updated: Object.keys(updates), profile: rows[0] });
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
  console.error("settings/profile", e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
