import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { randomUUID } from "crypto";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXT = new Set(["pdf", "doc", "docx"]);

const BUCKET_CONFIG = {
  resume:       { bucket: "resumes",       maxBytes: 2 * 1024 * 1024, label: "2 MB" },
  cover_letter: { bucket: "cover_letters", maxBytes: 512 * 1024,      label: "512 KB" },
} as const;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await rateLimit(`careers-upload:${ip}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429 }
    );
  }

  let formData: globalThis.FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const file = formData.get("file");
  const fileType = formData.get("fileType");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 422 });
  }
  if (typeof fileType !== "string" || !Object.hasOwn(BUCKET_CONFIG, fileType)) {
    return NextResponse.json({ error: "Invalid file type parameter." }, { status: 422 });
  }

  const config = BUCKET_CONFIG[fileType as keyof typeof BUCKET_CONFIG];

  // MIME type validation (primary check — not spoofable via extension alone)
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, DOC, or DOCX files are accepted." },
      { status: 422 }
    );
  }

  // Extension validation (belt-and-suspenders)
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Only PDF, DOC, or DOCX files are accepted." },
      { status: 422 }
    );
  }

  // Size validation
  if (file.size > config.maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum is ${config.label}.` },
      { status: 422 }
    );
  }

  // Use a UUID path — avoids PII in storage keys, prevents overwrites
  const path = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(config.bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error(`careers storage upload error (${config.bucket}):`, error.message);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ path }, { status: 201 });
}
