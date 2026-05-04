import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** GET  — list recent notifications (max 30) */
export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, type, category, actor_id, entity_id, title, body, read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("notifications GET", error);
      return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
    }
    const { count } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);

    return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 });
  } catch (e: unknown) {
    return serverError(e);
  }
}

/** POST — mark notification(s) as read */
export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();

    // Mark all unread as read
    if (body.all === true) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) {
        console.error("notifications POST mark-all-read", error);
        return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Mark single unread notification as read
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      console.error("notifications POST mark-read", error);
      return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return serverError(e);
  }
}

/** DELETE — clear notification(s) */
export async function DELETE(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    if (body.all === true) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        console.error("notifications DELETE clear-all", error);
        return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("notifications DELETE single", error);
      return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
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
  console.error("notifications", e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
