import { NextResponse } from "next/server";

export const runtime = "nodejs";

type MsgInput = { role: string; text: string };

// Keyword-based smart suggestion engine
function generateSuggestions(messages: MsgInput[]): string[] {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return [];

  const t = lastUser.text.toLowerCase();
  const suggestions: string[] = [];

  // Withdrawal / payout issues
  if (t.includes("withdraw") || t.includes("payout") || t.includes("cash out") || t.includes("transfer")) {
    suggestions.push(
      "What happens when you tap withdraw? Do you see an error message?",
      "Can you confirm your linked bank account is still active?",
      "Payouts typically take 1-3 business days. Let me check the status of yours.",
    );
  }

  // Balance / wallet questions
  if (t.includes("balance") || t.includes("wallet") || t.includes("money") || t.includes("funds")) {
    suggestions.push(
      "Can you tell me what balance amount you're seeing?",
      "Let me check your wallet — one moment please.",
      "Try refreshing the page and let me know if the balance updates.",
    );
  }

  // Payment / tip issues
  if (t.includes("tip") || t.includes("payment") || t.includes("charge") || t.includes("paid")) {
    suggestions.push(
      "Can you share the approximate amount and date of the transaction?",
      "I can look up that payment for you — one moment.",
      "Was this a tip you sent or received?",
    );
  }

  // Profile / account questions
  if (t.includes("profile") || t.includes("name") || t.includes("handle") || t.includes("account") || t.includes("settings")) {
    suggestions.push(
      "You can update that from your profile settings. Is something not saving correctly?",
      "What change are you trying to make?",
      "Let me check your account settings.",
    );
  }

  // Errors / bugs
  if (t.includes("error") || t.includes("bug") || t.includes("broken") || t.includes("crash") || t.includes("not working") || t.includes("doesn't work")) {
    suggestions.push(
      "Can you describe exactly what you see when the error occurs?",
      "What device and browser are you using?",
      "Try clearing your browser cache and refreshing — does that help?",
    );
  }

  // Refund requests
  if (t.includes("refund") || t.includes("cancel") || t.includes("reverse") || t.includes("charge back")) {
    suggestions.push(
      "I can look into a refund for you. Can you share the transaction details?",
      "Refunds typically take 5-10 business days to appear on your statement.",
      "Let me check if this transaction is eligible for a refund.",
    );
  }

  // Generic / greeting
  if (t.includes("help") || t.includes("hi") || t.includes("hello") || t.includes("hey") || suggestions.length === 0) {
    suggestions.push(
      "I'm here to help! Can you tell me more about what's going on?",
      "I'm reviewing your issue now — one moment please.",
      "Could you share a bit more detail so I can assist you better?",
    );
  }

  // Always offer resolution / closing options after a few messages
  if (messages.length >= 6) {
    suggestions.push(
      "This has been resolved. Let me know if you need anything else!",
    );
  }

  // Deduplicate and limit to 3
  return [...new Set(suggestions)].slice(0, 3);
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const suggestions = generateSuggestions(messages);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
