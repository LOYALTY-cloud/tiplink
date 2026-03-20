import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_KEYS = ["notify_tips", "notify_payouts", "notify_security"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const { data, error } = await supabaseAdmin
      .from("user_settings")
      .select("notify_tips, notify_payouts, notify_security")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // First visit: insert default row so future toggles always upsert cleanly
    if (!data) {
      const defaults = { user_id: user.id, notify_tips: true, notify_payouts: true, notify_security: true };
      await supabaseAdmin.from("user_settings").insert(defaults);
      return NextResponse.json({ notify_tips: true, notify_payouts: true, notify_security: true });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    if (!token) return unauthorized();

    const user = await getUser(token);
    if (!user) return unauthorized();

    const body = await req.json();
    const key = body.key as string;
    const value = body.value;

    if (!ALLOWED_KEYS.includes(key as SettingKey)) {
      return NextResponse.json({ error: "Invalid setting key" }, { status: 400 });
    }
    if (typeof value !== "boolean") {
      return NextResponse.json({ error: "Value must be boolean" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          [key]: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  const msg = e instanceof Error ? e.message : String(e ?? "Server error");
  return NextResponse.json({ error: msg }, { status: 500 });
}
