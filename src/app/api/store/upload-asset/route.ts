import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCreator } from "@/lib/creatorGuard";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "store-assets";

/**
 * POST /api/store/upload-asset
 *
 * Accepts multipart/form-data with:
 *   file  — the image File
 *   type  — "avatar" | "banner"
 *
 * Uploads to store-assets/{userId}/{type}.{ext} (upsert) using the service
 * role key so no bucket RLS policy is required on the client side.
 *
 * Returns { url: string }
 */
export async function POST(req: Request) {
  const session = await requireCreator(req);
  if (session instanceof NextResponse) return session;
  const { userId } = session;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const type = formData.get("type");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (type !== "avatar" && type !== "banner") {
    return NextResponse.json({ error: "type must be avatar or banner" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic bytes validation — MIME type spoofing guard (e.g. .exe renamed as .jpg)
  const isValidImage =
    (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || // JPEG
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) || // PNG
    (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") || // WebP
    (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46); // GIF
  if (!isValidImage) {
    return NextResponse.json({ error: "Invalid file content" }, { status: 400 });
  }

  const ext = file.type === "image/jpeg" ? "jpg"
    : file.type === "image/png"  ? "png"
    : file.type === "image/webp" ? "webp"
    : "gif";

  const path = `${userId}/${type}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600", // fixed per-user path (upsert) — 1h cache so re-uploads propagate
    });

  if (uploadErr) {
    console.error("store/upload-asset:", uploadErr);
    return NextResponse.json({ error: "Image upload failed. Please try again." }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

  // Cache-bust so browsers see the new image immediately
  const url = `${data.publicUrl}?t=${Date.now()}`;

  return NextResponse.json({ url });
}
