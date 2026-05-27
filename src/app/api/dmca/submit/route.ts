import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendDmcaSubmittedEmail } from "@/lib/dmcaEmails";

export const runtime = "nodejs";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;

export async function POST(req: Request) {
  try {
    // 1. Parse FormData + validate fields first — invalid inputs must NOT
    //    consume the submitter's rate-limit budget.
    const formData = await req.formData();

    const firstName           = String(formData.get("first_name")            ?? "").trim();
    const lastName            = String(formData.get("last_name")             ?? "").trim();
    const organization        = String(formData.get("organization")          ?? "").trim() || null;
    const email               = String(formData.get("email")                 ?? "").trim();
    const phone               = String(formData.get("phone")                 ?? "").trim() || null;
    const copyrightedWork     = String(formData.get("copyrighted_work")      ?? "").trim();
    const originalUrl         = String(formData.get("original_content_url")  ?? "").trim() || null;
    const infringingUrl       = String(formData.get("infringing_content_url")?? "").trim();
    const infringementDetails = String(formData.get("infringement_details")  ?? "").trim();
    const signature           = String(formData.get("electronic_signature")  ?? "").trim();

    if (!firstName || !lastName || !email || !copyrightedWork || !infringingUrl || !infringementDetails || !signature) {
      return NextResponse.json({ error: "Required fields are missing." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (copyrightedWork.length > 5000 || infringementDetails.length > 5000) {
      return NextResponse.json({ error: "Description too long (max 5000 characters)." }, { status: 400 });
    }

    // 2. Rate limit: 3 valid (syntactically correct) submissions per 10 min per IP
    const ip = getClientIp(req);
    const { allowed } = await rateLimit(`dmca:ip:${ip}`, 3, 600);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many submissions. Please wait before trying again." },
        { status: 429 }
      );
    }

    // 3. Resolve optional auth user
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    // 3b. Enforce active-report limits per submitter
    // Rules enforced together (checked by user_id if logged in, always also by email):
    //   • max 1 report with status = 'reviewing' at a time
    //   • max 2 open reports (pending OR reviewing) at a time
    {
      let query = supabaseAdmin
        .from("dmca_reports")
        .select("status")
        .in("status", ["pending", "reviewing"]);

      // Match by user_id OR email (covers both authenticated and anonymous repeat-submitters)
      if (userId) {
        query = query.or(`user_id.eq.${userId},email.eq.${email}`);
      } else {
        query = query.eq("email", email);
      }

      const { data: openReports } = await query;

      if (openReports && openReports.some((r) => r.status === "reviewing")) {
        return NextResponse.json(
          { error: "You already have a complaint that is currently under review. Please wait for it to be resolved before submitting another." },
          { status: 409 }
        );
      }
      if (openReports && openReports.length >= 2) {
        return NextResponse.json(
          { error: "You already have 2 open complaints. Please wait for them to be resolved before submitting a new one." },
          { status: 409 }
        );
      }
    }

    // 4. Upload evidence files to private bucket
    const evidenceStoragePaths: string[] = [];
    const files = formData.getAll("evidence[]") as File[];
    const validFiles = files.filter((f) => f && f.size > 0).slice(0, MAX_FILES);

    for (const file of validFiles) {
      if (!ALLOWED_MIME.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${crypto.randomUUID()}.${ext}`;
      const bytes = await file.arrayBuffer();

      const { error: uploadErr } = await supabaseAdmin.storage
        .from("dmca-evidence")
        .upload(path, bytes, { contentType: file.type, upsert: false });

      if (!uploadErr) {
        evidenceStoragePaths.push(path);
      } else {
        console.warn("dmca/submit: evidence upload error", uploadErr.message);
      }
    }

    // 5. Insert report
    const { data, error } = await supabaseAdmin
      .from("dmca_reports")
      .insert({
        user_id:                userId,
        first_name:             firstName,
        last_name:              lastName,
        organization,
        email,
        phone,
        copyrighted_work:       copyrightedWork,
        original_content_url:   originalUrl,
        infringing_content_url: infringingUrl,
        infringement_details:   infringementDetails,
        evidence_urls:          evidenceStoragePaths,
        electronic_signature:   signature,
      })
      .select("id")
      .single();

    if (error) {
      console.error("dmca/submit insert error:", error);
      return NextResponse.json({ error: "Failed to submit complaint. Please try again." }, { status: 500 });
    }

    // Send submission confirmation email (fire-and-forget)
    sendDmcaSubmittedEmail({
      to: email,
      firstName,
      reportId: data.id,
      infringingUrl,
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("dmca/submit error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
