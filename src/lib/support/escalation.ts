import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignBestAdmin } from "./autoAssign";

// ============================================================
// Escalation signals — keyword & sentiment detection
// ============================================================

const FRUSTRATION_SIGNALS = [
  "this is ridiculous",
  "this is unacceptable",
  "i'm done",
  "im done",
  "terrible",
  "worst",
  "scam",
  "fraud",
  "lawsuit",
  "lawyer",
  "legal",
  "sue you",
  "report you",
  "bbb",
  "attorney general",
  "consumer protection",
  "hate this",
  "so frustrated",
  "furious",
  "angry",
  "pissed",
  "wtf",
  "what the hell",
  "what the f",
  "are you serious",
  "absolutely useless",
  "waste of time",
  "you people",
  "nothing works",
  "broken",
  "still not working",
  "still broken",
  "never works",
];

const MONEY_SIGNALS = [
  "money is gone",
  "money disappeared",
  "stole my money",
  "where is my money",
  "missing money",
  "lost my money",
  "charged me twice",
  "double charged",
  "unauthorized charge",
  "didn't authorize",
  "wrong amount",
  "overcharged",
  "money not showing",
  "funds missing",
  "withdrawal failed",
  "payout never arrived",
  "never received",
  "took my money",
];

const REPEATED_FAILURE_SIGNALS = [
  "already told you",
  "i already said",
  "i said this before",
  "keeps happening",
  "happening again",
  "same problem",
  "same issue",
  "still the same",
  "not helpful",
  "that didn't work",
  "doesn't work",
  "didn't help",
  "tried that already",
  "already tried",
  "you already told me",
  "told me the same thing",
  "going in circles",
  "keeps saying the same",
  "not listening",
];

const CONFUSION_SIGNALS = [
  "i don't understand",
  "i dont understand",
  "makes no sense",
  "what does that mean",
  "confused",
  "this is confusing",
  "i'm lost",
  "im lost",
  "can you explain",
  "i have no idea",
  "none of this makes sense",
  "what am i supposed to do",
  "how do i even",
  "help me please",
  "please help",
  "someone help",
  "need a real person",
  "talk to a human",
  "talk to someone",
  "real person",
  "human agent",
  "speak to someone",
  "actual person",
  "not a bot",
  "stop with the bot",
];

// ============================================================
// Escalation scoring
// ============================================================

export type EscalationReason =
  | "frustration"
  | "money_issue"
  | "repeated_failure"
  | "confusion"
  | "explicit_request"
  | "high_fail_count";

export type EscalationResult = {
  shouldEscalate: boolean;
  confidence: number; // 0.0 – 1.0
  reasons: EscalationReason[];
  topReason: EscalationReason | null;
};

const ESCALATION_THRESHOLD = 0.6;
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between escalations per session

/**
 * Analyze a user message + conversation context to decide if escalation is needed.
 */
export function analyzeEscalation(
  message: string,
  failCount: number,
  messageCount: number,
): EscalationResult {
  const lower = message.toLowerCase();
  let score = 0;
  const reasons: EscalationReason[] = [];

  // 1. Frustration keywords (high weight)
  const frustrationHits = FRUSTRATION_SIGNALS.filter((s) => lower.includes(s));
  if (frustrationHits.length > 0) {
    score += Math.min(0.4, frustrationHits.length * 0.2);
    reasons.push("frustration");
  }

  // 2. Money issue keywords (high weight — financial risk)
  const moneyHits = MONEY_SIGNALS.filter((s) => lower.includes(s));
  if (moneyHits.length > 0) {
    score += Math.min(0.5, moneyHits.length * 0.25);
    reasons.push("money_issue");
  }

  // 3. Repeated failure signals
  const repeatHits = REPEATED_FAILURE_SIGNALS.filter((s) => lower.includes(s));
  if (repeatHits.length > 0) {
    score += Math.min(0.35, repeatHits.length * 0.2);
    reasons.push("repeated_failure");
  }

  // 4. Confusion / help-seeking
  const confusionHits = CONFUSION_SIGNALS.filter((s) => lower.includes(s));
  if (confusionHits.length > 0) {
    score += Math.min(0.3, confusionHits.length * 0.15);
    reasons.push("confusion");
  }

  // 5. Explicit human request (immediate escalation)
  const humanRequest = [
    "talk to a human",
    "talk to someone",
    "real person",
    "human agent",
    "speak to someone",
    "actual person",
    "need a real person",
    "not a bot",
    "stop with the bot",
    "connect me to support",
    "live agent",
    "live support",
  ].some((s) => lower.includes(s));

  if (humanRequest) {
    score += 0.7;
    reasons.push("explicit_request");
  }

  // 6. Fail count escalation (from thumbs-down feedback)
  if (failCount >= 3) {
    score += 0.5;
    reasons.push("high_fail_count");
  } else if (failCount === 2) {
    score += 0.2;
  }

  // 7. Long conversation boost — if we're 8+ messages in, user is struggling
  if (messageCount >= 8) {
    score += 0.1;
  }
  if (messageCount >= 15) {
    score += 0.1;
  }

  // Clamp
  const confidence = Math.min(1.0, score);
  const shouldEscalate = confidence >= ESCALATION_THRESHOLD;

  // Pick top reason by weight
  const reasonWeights: Record<EscalationReason, number> = {
    explicit_request: 5,
    money_issue: 4,
    frustration: 3,
    high_fail_count: 2,
    repeated_failure: 1,
    confusion: 0,
  };
  const topReason =
    reasons.length > 0
      ? reasons.sort((a, b) => reasonWeights[b] - reasonWeights[a])[0]
      : null;

  return { shouldEscalate, confidence, reasons, topReason };
}

// ============================================================
// Escalation trigger — updates DB, assigns admin, notifies
// ============================================================

export type EscalationOutcome = {
  escalated: boolean;
  adminAssigned: boolean;
  adminName: string | null;
  reason: EscalationReason | null;
  cooldown: boolean;
};

/**
 * Trigger an escalation on a support session.
 * Respects cooldown (won't re-escalate within 2 min).
 * Returns outcome for the client to act on.
 */
export async function triggerEscalation(
  sessionId: string,
  reasons: EscalationReason[],
  topReason: EscalationReason | null,
  confidence: number,
): Promise<EscalationOutcome> {
  // 1. Check cooldown
  const { data: session } = await supabaseAdmin
    .from("support_sessions")
    .select("id, escalated_at, escalation, priority, mode")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return { escalated: false, adminAssigned: false, adminName: null, reason: null, cooldown: false };
  }

  if (session.escalated_at) {
    const elapsed = Date.now() - new Date(session.escalated_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      return { escalated: false, adminAssigned: false, adminName: null, reason: null, cooldown: true };
    }
  }

  // 2. Update session with escalation info
  const newPriority = Math.max(session.priority ?? 0, reasons.includes("money_issue") ? 3 : 2);

  await supabaseAdmin
    .from("support_sessions")
    .update({
      escalation: true,
      escalation_reason: topReason,
      escalated_at: new Date().toISOString(),
      priority: newPriority,
    })
    .eq("id", sessionId);

  // 3. Insert system message
  const reasonLabel = escalationReasonLabel(topReason);
  await supabaseAdmin.from("support_messages").insert({
    session_id: sessionId,
    sender_type: "system",
    message: `⚠️ Escalation triggered — ${reasonLabel}. Attempting to connect a live agent.`,
  });

  // 4. Try assigning an admin
  let adminAssigned = false;
  let adminName: string | null = null;

  if (session.mode === "ai") {
    const admin = await assignBestAdmin(sessionId, {
      priority: newPriority,
      message: reasonLabel,
      confidence,
    });

    if (admin) {
      adminAssigned = true;
      adminName = admin.display_name;

      // Upgrade mode to human
      await supabaseAdmin
        .from("support_sessions")
        .update({ mode: "human" })
        .eq("id", sessionId);

      await supabaseAdmin.from("support_messages").insert({
        session_id: sessionId,
        sender_type: "system",
        message: `Live support connected — ${admin.display_name || "an agent"} is now helping you.`,
      });
    }
  }

  return {
    escalated: true,
    adminAssigned,
    adminName,
    reason: topReason,
    cooldown: false,
  };
}

function escalationReasonLabel(reason: EscalationReason | null): string {
  switch (reason) {
    case "frustration":
      return "User frustration detected";
    case "money_issue":
      return "Financial concern flagged";
    case "repeated_failure":
      return "Repeated unsuccessful attempts";
    case "confusion":
      return "User needs additional guidance";
    case "explicit_request":
      return "User requested human support";
    case "high_fail_count":
      return "Multiple unhelpful responses";
    default:
      return "Escalation requested";
  }
}
