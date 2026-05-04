import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmailAsync } from "@/lib/emailService";
import { eliteCreatorSubmittedHtml } from "@/lib/email/eliteCreatorEmails";

export const runtime = "nodejs";
const ELITE_LIMIT = 10;

type ApplyBody = {
  name?: string;
  email?: string;
  creator_type?: string;
  experience?: string;
  work?: string;
  portfolio?: string;
  intent?: string;
  display_name?: string;
  handle?: string;
};

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function POST(req: Request) {
  try {
    const { count: approvedCount, error: limitErr } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");

    if (limitErr) {
      console.error("elite-creator/apply limit check:", limitErr);
      return NextResponse.json({ error: "Failed to validate capacity" }, { status: 500 });
    }

    if ((approvedCount ?? 0) >= ELITE_LIMIT) {
      return NextResponse.json({ error: "Elite Creator Program Full" }, { status: 409 });
    }

    let body: ApplyBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const email = clean(body.email);
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // One application per email.
    const { data: existing } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "An application for this email already exists" }, { status: 409 });
    }

    const payload = {
      user_id: null,
      name: clean(body.name),
      email,
      creator_type: clean(body.creator_type),
      experience: clean(body.experience),
      work: clean(body.work),
      portfolio: clean(body.portfolio),
      intent: clean(body.intent),
      display_name: clean(body.display_name),
      handle: clean(body.handle),
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.intent) {
      return NextResponse.json({ error: "Intent is required" }, { status: 400 });
    }

    if (!payload.display_name || !payload.handle) {
      return NextResponse.json({ error: "Display name and handle are required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("elite_creator_applications")
      .insert(payload);

    if (error) {
      console.error("elite-creator/apply POST:", error);
      return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
    }

    // Fire-and-forget confirmation email — never blocks the response.
    if (payload.email) {
      sendEmailAsync({
        type: "ELITE_CREATOR_SUBMITTED",
        to: payload.email,
        subject: "1neLink Creator Application Received",
        html: eliteCreatorSubmittedHtml(payload.name ?? ""),
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("elite-creator/apply POST:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim();
    if (!email) return NextResponse.json({ error: "email param required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("elite_creator_applications")
      .select("id, status, reviewed_at, created_at")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("elite-creator/apply GET:", error);
      return NextResponse.json({ error: "Failed to load application" }, { status: 500 });
    }

    return NextResponse.json({ application: data ?? null });
  } catch (e) {
    console.error("elite-creator/apply GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}