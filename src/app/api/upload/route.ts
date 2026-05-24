import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

type Body = {
  bucket: string;
  fileName: string;
  fileBase64: string;
  oldPublicUrl?: string;
};

const ALLOWED_BUCKETS = ["avatars", "banners", "theme-backgrounds"];

export async function POST(req: Request) {
  try {
    // Authenticate via Bearer token (sent by theme builder) or cookie fallback
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    let userId: string;
    if (bearerToken) {
      const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(bearerToken);
      if (authErr || !userData?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = userData.user.id;
    } else {
      const { createSupabaseRouteClient } = await import("@/lib/supabase/server");
      const supabaseAuth = await createSupabaseRouteClient();
      const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
      if (authErr || !authData?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = authData.user.id;
    }

    const body: Body = await req.json();
    const { bucket, fileName, fileBase64, oldPublicUrl } = body;

    console.log("/api/upload called", { bucket, fileName, hasOld: !!oldPublicUrl });

    if (!bucket || !fileName || !fileBase64) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    // Validate bucket is in the allow-list
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    // Ensure file path is scoped to the authenticated user
    if (!fileName.startsWith(`${userId}/`) && !fileName.startsWith(`${userId}_`)) {
      return NextResponse.json({ error: "File path not authorized" }, { status: 403 });
    }

    // Rate limit: 10 uploads per hour per IP
    const ip = getClientIp(req);
    const { allowed: withinLimit } = await rateLimit(`upload:${ip}`, 10, 3600);
    if (!withinLimit) {
      return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
    }

    // Basic validation: reject non-image extensions
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const allowed = ['png','jpg','jpeg','webp','gif','avif'];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    let supabase: unknown;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    } else {
      const { createSupabaseRouteClient: createRouteClient } = await import("@/lib/supabase/server");
      supabase = await createRouteClient();
    }

    // Decode base64
    const buffer = Buffer.from(fileBase64, 'base64');

    // Server-side max size 6MB
    if (buffer.length > 6 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Magic bytes validation — verify actual file content matches declared image type.
    // Prevents extension spoofing (e.g. script.js renamed to script.js.jpg).
    const isValidImageMagicBytes =
      (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || // JPEG
      (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) || // PNG
      (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') || // WebP
      (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) || // GIF
      (buffer.slice(4, 8).toString('ascii') === 'ftyp') || // MP4/AVIF ftyp box
      (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer.slice(4, 8).toString('ascii') === 'ftyp'); // AVIF
    if (!isValidImageMagicBytes) {
      return NextResponse.json({ error: 'Invalid file content' }, { status: 400 });
    }

    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      webp: "image/webp", gif: "image/gif", avif: "image/avif",
    };
    const contentType = mimeMap[ext] ?? "image/jpeg";
    // theme-backgrounds use unique timestamped paths → immutable long cache
    // avatars/banners use fixed per-user paths (upsert) → 1h cache so re-uploads propagate
    const cacheControl = bucket === "theme-backgrounds" ? "31536000" : "3600";
    const { error: upErr } = await (supabase as any).storage.from(bucket).upload(fileName, buffer, { upsert: true, contentType, cacheControl });
    if (upErr) {
      console.error("upload error", upErr);
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }

    // delete old file if provided
    if (oldPublicUrl) {
      try {
        const key = extractKeyFromPublicUrl(oldPublicUrl, bucket);
        if (key) {
          await (supabase as any).storage.from(bucket).remove([key]);
        }
      } catch (e) {
        console.error("delete old object error", e);
      }
    }

    const { data } = (supabase as any).storage.from(bucket).getPublicUrl(fileName);

    console.log("/api/upload success", { publicUrl: data.publicUrl });
    return NextResponse.json({ publicUrl: data.publicUrl });
  } catch (err: unknown) {
    console.error("upload", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function extractKeyFromPublicUrl(url: string, bucket: string) {
  try {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.substring(idx + marker.length));
  } catch (e) {
    return null;
  }
}
