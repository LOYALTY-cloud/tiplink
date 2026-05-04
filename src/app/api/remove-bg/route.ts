import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createSupabaseRouteClient();
    const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed } = await rateLimit(`remove-bg:${ip}`, 25, 3600);
    if (!allowed) {
      return NextResponse.json({ error: "Too many cutout requests. Try again later." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
    }

    const maxInputBytes = 8 * 1024 * 1024;
    if (file.size > maxInputBytes) {
      return NextResponse.json({ error: "Image too large. Max 8 MB." }, { status: 400 });
    }

    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "REMOVE_BG_API_KEY is not configured." }, { status: 503 });
    }

    const upstreamBody = new FormData();
    upstreamBody.append("image_file", file, file.name || "image.png");
    upstreamBody.append("size", "auto");

    const upstream = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: upstreamBody,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("remove-bg upstream error:", errorText);
      return NextResponse.json({ error: "Background removal failed." }, { status: 502 });
    }

    const blob = await upstream.blob();
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("remove-bg route error:", error);
    return NextResponse.json({ error: "Server error while removing background." }, { status: 500 });
  }
}