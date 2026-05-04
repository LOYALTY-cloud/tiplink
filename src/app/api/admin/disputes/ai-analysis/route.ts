import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminFromRequest } from "@/lib/auth/getAdminFromSession";
import { requireRole } from "@/lib/auth/requireRole";
import { rateLimit } from "@/lib/rateLimit";
import { analyzeCase, buildSignals, UNAVAILABLE } from "@/lib/aiCaseAnalysis";
import type { AICaseAnalysis, CaseContext } from "@/lib/aiCaseAnalysis";

export const runtime = "nodejs";

/**
 * POST /api/admin/disputes/ai-analysis
 * Run AI case analysis for a specific dispute.
 * Returns cached result if fresh (<1 hour), otherwise runs new analysis.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAdminFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireRole(session.role, "view_admin");

    const { allowed } = await rateLimit(`ai-case:${session.userId}`, 15, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited — try again shortly." }, { status: 429 });
    }

    const { receipt_id, force_refresh } = await req.json();
    if (!receipt_id || typeof receipt_id !== "string") {
      return NextResponse.json({ error: "receipt_id required" }, { status: 400 });
    }

    // ── Check cache (unless forced refresh) ──
    if (!force_refresh) {
      const { data: cached } = await supabaseAdmin
        .from("dispute_ai_analysis")
        .select("*")
        .eq("receipt_id", receipt_id)
        .maybeSingle();

      if (cached?.ai_summary) {
        const age = Date.now() - new Date(cached.ai_last_updated).getTime();
        if (age < 60 * 60 * 1000) {
          // Fresh cache — return it
          return NextResponse.json({
            analysis: {
              summary: cached.ai_summary,
              risk_level: cached.ai_risk_level,
              signals: cached.ai_signals ?? [],
              explanation: cached.ai_explanation ?? [],
              suggested_actions: cached.ai_suggested_actions ?? [],
            } as AICaseAnalysis,
            cached: true,
            updated_at: cached.ai_last_updated,
          });
        }
      }
    }

    // ── Gather dispute data ──
    const { data: tip } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id, creator_user_id, tip_amount, refund_status, created_at, status")
      .eq("receipt_id", receipt_id)
      .maybeSingle();

    if (!tip) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Get creator profile for account age
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("created_at, is_restricted, restriction_reason")
      .eq("user_id", tip.creator_user_id)
      .maybeSingle();

    // Count previous disputes for this creator
    const { count: prevDisputes } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id", { count: "exact", head: true })
      .eq("creator_user_id", tip.creator_user_id)
      .eq("status", "disputed");

    // Check pending withdrawal
    const { count: pendingPayouts } = await supabaseAdmin
      .from("tip_intents")
      .select("receipt_id", { count: "exact", head: true })
      .eq("creator_user_id", tip.creator_user_id)
      .eq("status", "pending_payout");

    // Account age in days
    const accountAge = profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    // Build signals from data
    const signals = buildSignals({
      account_age_days: accountAge,
      previous_disputes: (prevDisputes ?? 1) - 1, // minus the current one
      has_pending_withdrawal: (pendingPayouts ?? 0) > 0,
      amount: Number(tip.tip_amount),
      had_prior_restriction: !!profile?.is_restricted,
      refund_status: tip.refund_status ?? "none",
    });

    // Build context
    const context: CaseContext = {
      amount: Number(tip.tip_amount),
      created_at: tip.created_at,
      previous_disputes: (prevDisputes ?? 1) - 1,
      account_age_days: accountAge,
      signals,
      has_pending_withdrawal: (pendingPayouts ?? 0) > 0,
      refund_status: tip.refund_status ?? "none",
    };

    // ── Run analysis ──
    const analysis = await analyzeCase(context);

    // ── Cache result ──
    if (analysis.summary !== UNAVAILABLE.summary) {
      await supabaseAdmin
        .from("dispute_ai_analysis")
        .upsert({
          receipt_id,
          ai_summary: analysis.summary,
          ai_risk_level: analysis.risk_level,
          ai_signals: analysis.signals,
          ai_explanation: analysis.explanation,
          ai_suggested_actions: analysis.suggested_actions,
          ai_last_updated: new Date().toISOString(),
        }, { onConflict: "receipt_id" })
        .then(({ error }) => {
          if (error) console.error("[AI Case] Cache write failed:", error.message);
        });
    }

    return NextResponse.json({
      analysis,
      cached: false,
      updated_at: new Date().toISOString(),
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[AI Case] Route error:", e instanceof Error ? e.message : e);
    return NextResponse.json({
      analysis: UNAVAILABLE,
      cached: false,
      error: "Analysis failed",
    });
  }
}
