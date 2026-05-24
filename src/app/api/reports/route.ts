import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const VALID_TARGET_TYPES = ["creator", "user", "transaction", "theme", "post", "comment"] as const;

const VALID_REASONS: Record<string, string> = {
  fraud:          "Fraud / Scam",
  impersonation:  "Impersonation",
  stolen_content: "Stolen / Copied Content",
  payment_abuse:  "Payment Abuse / Chargeback Fraud",
  spam:           "Spam",
  harassment:     "Harassment",
  inappropriate:  "Inappropriate Content",
  fake_tips:      "Fake Tips / Fake Support",
  payout_abuse:   "Payout Abuse",
  other:          "Other",
};

// These reasons always flag requires_manual_review
const MANUAL_REVIEW_REASONS = new Set(["fraud", "impersonation", "payment_abuse", "fake_tips", "payout_abuse"]);
// These target_types always flag requires_manual_review
const MANUAL_REVIEW_TARGETS = new Set(["transaction"]);
// These trigger high/critical priority
const HIGH_PRIORITY_REASONS = new Set(["fraud", "impersonation", "payment_abuse", "fake_tips", "payout_abuse"]);

/** POST /api/reports — submit a user report */
export async function POST(req: Request) {
  try {
    // 1. Auth — require valid session
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const reporterId = authData.user.id;

    // 2. Rate limit — 5 reports per 10 min per user, 20/10min per IP
    const ip = getClientIp(req);
    const [userLimit, ipLimit] = await Promise.all([
      rateLimit(`report:user:${reporterId}`, 5, 600),
      rateLimit(`report:ip:${ip}`, 20, 600),
    ]);
    if (!userLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json({ error: "Too many reports. Please wait before submitting again." }, { status: 429 });
    }

    // 3. Parse + validate body
    const body = await req.json();
    const { target_type, target_id, target_handle, target_owner_id, reason, details, evidence_urls } = body as {
      target_type?: string;
      target_id?: string;
      target_handle?: string;   // @handle — resolved server-side to user_id
      target_owner_id?: string | null;
      reason?: string;
      details?: string;
      evidence_urls?: string[];
    };

    if (!target_type || !VALID_TARGET_TYPES.includes(target_type as typeof VALID_TARGET_TYPES[number])) {
      return NextResponse.json({ error: "Invalid target_type" }, { status: 400 });
    }

    // UUID format validator
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Resolve target: either direct UUID or handle lookup
    let resolvedTargetId = target_id;
    let resolvedOwnerId  = target_owner_id ?? null;

    if (!resolvedTargetId && target_handle) {
      const rawInput = target_handle.trim();

      // For non-profile targets (transaction, theme, post, comment) the caller sends the
      // UUID directly — there is no profile handle to look up.
      const isNonProfileTarget = target_type === "transaction" || target_type === "theme"
        || target_type === "post" || target_type === "comment";

      if (isNonProfileTarget) {
        // Accept the raw value as the target_id; UUID validation happens below
        resolvedTargetId = rawInput;
      } else {
        // user / creator — resolve @handle → profiles.user_id
        const cleanHandle = rawInput.replace(/^@/, "").toLowerCase();
        if (!cleanHandle) return NextResponse.json({ error: "target_handle is empty" }, { status: 400 });

        const { data: found } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("handle", cleanHandle)
          .maybeSingle();

        if (!found) {
          return NextResponse.json({ error: `User @${cleanHandle} not found` }, { status: 404 });
        }
        resolvedTargetId = found.user_id;
        if (!resolvedOwnerId) resolvedOwnerId = found.user_id;
      }
    }

    if (!resolvedTargetId || typeof resolvedTargetId !== "string") {
      return NextResponse.json({ error: "target_id or target_handle is required" }, { status: 400 });
    }

    // target_id must be a valid UUID (DB column type is uuid)
    if (!UUID_RE.test(resolvedTargetId)) {
      return NextResponse.json({ error: "target_id must be a valid UUID" }, { status: 400 });
    }
    if (!reason || !VALID_REASONS[reason]) {
      return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
    }
    if (details && details.length > 2000) {
      return NextResponse.json({ error: "Details too long (max 2000 chars)" }, { status: 400 });
    }

    // 4. Self-report check
    if (resolvedOwnerId && resolvedOwnerId === reporterId) {
      return NextResponse.json({ error: "You cannot report your own content" }, { status: 400 });
    }
    if (resolvedTargetId === reporterId) {
      return NextResponse.json({ error: "You cannot report yourself" }, { status: 400 });
    }

    // 5. Banned/suspended user check — don't allow banned users to spam reports
    const { data: reporterProfile } = await supabaseAdmin
      .from("profiles")
      .select("status")
      .eq("user_id", reporterId)
      .maybeSingle();

    if (reporterProfile?.status === "banned") {
      return NextResponse.json({ error: "Your account is not permitted to submit reports" }, { status: 403 });
    }

    // 6. Sanitise evidence_urls — max 5, https:// only (block javascript: etc.)
    const safeUrls = (evidence_urls ?? [])
      .slice(0, 5)
      .filter((u) => typeof u === "string" && u.length < 500 && /^https?:\/\//i.test(u));

    // 7. Determine priority and manual review flag
    const requiresManual =
      MANUAL_REVIEW_REASONS.has(reason) || MANUAL_REVIEW_TARGETS.has(target_type);

    const priority = HIGH_PRIORITY_REASONS.has(reason) ? "high" : "normal";

    // 8. Insert — unique constraint on (reporter_id, target_id, target_type) WHERE pending
    const { data: report, error: insertErr } = await supabaseAdmin
      .from("reports")
      .insert({
        reporter_id: reporterId,
        target_type,
        target_id: resolvedTargetId,
        target_owner_id: resolvedOwnerId,
        reason,
        details: details?.trim() ?? null,
        evidence_urls: safeUrls.length > 0 ? safeUrls : null,
        status: "pending",
        priority,
        requires_manual_review: requiresManual,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Postgres unique violation = duplicate pending report
      if (insertErr.code === "23505") {
        return NextResponse.json({ error: "You already have a pending report for this content" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: report.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET /api/reports — list the current user's own reports */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: reports } = await supabaseAdmin
      .from("reports")
      .select("id, target_type, reason, status, priority, created_at")
      .eq("reporter_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ reports: reports ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
