import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extractIdData } from "@/lib/ocr";
import { matchIdentity } from "@/lib/matchIdentity";

export const runtime = "nodejs";

const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "pdf"];
const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const VALID_DOC_TYPES = ["id_card", "passport", "driver_license"];
const BUCKET = "kyc-documents";
const SIGNED_URL_SECONDS = 120;
const MAX_UPLOADS_PER_DAY = 3;

export async function POST(req: Request) {
  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(
      authHeader.slice(7)
    );
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userRes.user.id;

    // Check for existing pending verification
    const { data: existing } = await supabaseAdmin
      .from("identity_verifications")
      .select("id, status")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "You already have a pending verification. Please wait for review." },
        { status: 400 }
      );
    }

    // Rate limit: max uploads per day
    const today = new Date().toISOString().slice(0, 10);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("verification_uploads_today, verification_uploads_date, full_name, display_name, dob")
      .eq("user_id", userId)
      .single();

    const uploadsToday =
      profile?.verification_uploads_date === today
        ? (profile?.verification_uploads_today ?? 0)
        : 0;

    if (uploadsToday >= MAX_UPLOADS_PER_DAY) {
      return NextResponse.json(
        { error: "Too many verification attempts today. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { document_type, file_base64, file_back_base64 } = body as {
      document_type: string;
      file_base64: string;
      file_back_base64?: string;
    };

    if (!document_type || !VALID_DOC_TYPES.includes(document_type)) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }
    if (!file_base64) {
      return NextResponse.json({ error: "Missing document" }, { status: 400 });
    }

    // Decode + validate front image
    const frontBuffer = Buffer.from(file_base64, "base64");
    if (frontBuffer.length > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
    }

    // Detect extension from magic bytes
    const ext = detectExt(frontBuffer);
    if (!ext || !ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "Invalid file type. Use PNG, JPG, WEBP, or PDF." }, { status: 400 });
    }

    // Upload front to PRIVATE bucket (no public URL)
    const ts = Date.now();
    const frontPath = `${userId}/${ts}-front.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(frontPath, frontBuffer, { upsert: false });

    if (upErr) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // Upload back (optional)
    let backPath: string | null = null;
    if (file_back_base64) {
      const backBuffer = Buffer.from(file_back_base64, "base64");
      if (backBuffer.length > MAX_SIZE) {
        return NextResponse.json({ error: "Back image too large (max 8MB)" }, { status: 400 });
      }
      const backExt = detectExt(backBuffer);
      if (!backExt || !ALLOWED_EXT.includes(backExt)) {
        return NextResponse.json({ error: "Invalid back image type" }, { status: 400 });
      }

      backPath = `${userId}/${ts}-back.${backExt}`;
      const { error: backUpErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(backPath, backBuffer, { upsert: false });

      if (backUpErr) backPath = null;
    }

    // Generate short-lived signed URL for OCR processing
    let ocrData = null;
    let matchScore: number | null = null;
    if (ext !== "pdf") {
      const { data: signedData } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(frontPath, SIGNED_URL_SECONDS);

      if (signedData?.signedUrl) {
        ocrData = await extractIdData(signedData.signedUrl);

        // Edge case: OCR could not read the document
        if (!ocrData.error && !ocrData.full_name) {
          ocrData.error = "Unable to read name from document — image may be blurry or obscured";
        }

        // Load profile for matching (reuse profile from rate-limit check)
        if (!ocrData.error && profile) {
          const match = matchIdentity(profile, ocrData);
          matchScore = match.score;
        }
      }
    }

    // Insert verification record (store paths, not public URLs)
    const { error: insertErr } = await supabaseAdmin
      .from("identity_verifications")
      .insert({
        user_id: userId,
        document_url: frontPath,
        document_back_url: backPath,
        document_path: frontPath,
        document_back_path: backPath,
        document_type,
        status: "pending",
        is_active: true,
        ocr_data: ocrData,
        match_score: matchScore,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Update profile: kyc_status + bump rate limit counter
    await supabaseAdmin
      .from("profiles")
      .update({
        kyc_status: "pending",
        verification_uploads_today: uploadsToday + 1,
        verification_uploads_date: today,
      })
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, message: "Verification submitted" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? "Server error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Detect file extension from magic bytes */
function detectExt(buf: Buffer): string | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "webp";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  return null;
}
