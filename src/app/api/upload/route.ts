import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

type Body = {
  bucket: string;
  fileName: string;
  fileBase64: string;
  oldPublicUrl?: string;
};

export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const { bucket, fileName, fileBase64, oldPublicUrl } = body;

    console.log("/api/upload called", { bucket, fileName, hasOld: !!oldPublicUrl });

    if (!bucket || !fileName || !fileBase64) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
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
      supabase = await createSupabaseRouteClient();
    }

    // decode base64
    const buffer = Buffer.from(fileBase64, 'base64');

    // server-side max size 6MB
    if (buffer.length > 6 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    const { error: upErr } = await (supabase as any).storage.from(bucket).upload(fileName, buffer, { upsert: true });
    if (upErr) {
      console.error("upload error", upErr);
      const msg = upErr instanceof Error ? upErr.message : String(upErr ?? "Upload error");
      return NextResponse.json({ error: msg }, { status: 500 });
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
    const errMsg = err instanceof Error ? err.message : String(err ?? "Server error");
    return NextResponse.json({ error: errMsg }, { status: 500 });
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
