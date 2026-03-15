import { getResend } from "@/lib/email/getResend";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  try {
    const { email, user_id } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Generate secure token.
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: deleteError } = await supabaseAdmin
      .from("email_verifications")
      .delete()
      .eq("email", normalizedEmail);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("email_verifications")
      .insert({
        email: normalizedEmail,
        user_id: user_id || null,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    const origin = req.headers.get("origin") ?? "https://tiplinkme.com";
    const confirmUrl = `${origin}/verify/callback?token=${token}`;

    const resend = getResend();
    await resend.emails.send({
      from: "no-reply@tiplinkme.com",
      to: normalizedEmail,
      subject: "Confirm your TipLinkMe account",
      html: `
        <h2>Welcome to TipLinkMe</h2>
        <p>Click below to confirm your email:</p>
        <a href="${confirmUrl}" style="
          background:black;
          color:white;
          padding:12px 20px;
          text-decoration:none;
          border-radius:6px;
        ">
          Confirm Email
        </a>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
