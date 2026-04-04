import OpenAI from "openai";
import { appMap, appMapContext } from "@/lib/appMap";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

type Action = { label: string; href: string };

export type AIReply = {
  reply: string;
  actions?: Action[];
};

const validPaths = new Set(Object.values(appMap).map((r) => r.path));

function isValidAction(a: unknown): a is Action {
  return !!a && typeof (a as any).label === "string" && typeof (a as any).href === "string" && validPaths.has((a as any).href);
}

/** Keyword → action lookup for when AI forgets to include a button */
const actionHints: { keywords: string[]; action: Action }[] = [
  { keywords: ["wallet", "balance", "money", "funds"], action: { label: "Go to Wallet", href: appMap.wallet.path } },
  { keywords: ["withdraw", "cash out", "payout"], action: { label: "Go to Wallet", href: appMap.wallet.path } },
  { keywords: ["onboarding", "enable payouts", "connect stripe"], action: { label: "Enable payouts", href: appMap.onboarding.path } },
  { keywords: ["transaction", "history", "receipt"], action: { label: "View Transactions", href: appMap.transactions.path } },
  { keywords: ["earning", "goal", "revenue"], action: { label: "View Earnings", href: appMap.earnings.path } },
  { keywords: ["profile", "handle", "bio", "display name"], action: { label: "Edit Profile", href: appMap.profile.path } },
  { keywords: ["share", "link", "qr"], action: { label: "Share your link", href: appMap.share.path } },
  { keywords: ["setting", "security", "delete account"], action: { label: "Go to Settings", href: appMap.settings.path } },
  { keywords: ["password", "forgot", "reset"], action: { label: "Reset password", href: appMap.resetPassword.path } },
];

export async function getAIReply(message: string, userContext?: Record<string, unknown>): Promise<AIReply> {
  const systemPrompt = `
You are a support assistant for 1neLink — a tipping platform.

App navigation:
${appMapContext()}

Rules:
- NEVER guess routes — ONLY use routes listed above
- Give short, clear, actionable answers (2-3 sentences max)
- If the user has an issue, guide them to the correct page
- Be confident but accurate
- If unsure, suggest contacting support
- Do NOT make up features that don't exist

Always respond in this JSON format:
{
  "reply": "your answer here",
  "actions": [
    { "label": "Button text", "href": "/route" }
  ]
}

If no action is needed, use an empty array:
{ "reply": "your answer here", "actions": [] }

Max 2 actions per response.

User context:
${JSON.stringify(userContext ?? {}, null, 2)}
`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    temperature: 0.3,
    max_tokens: 256,
  });

  const content = completion.choices[0].message.content ?? "";
  let result: AIReply;

  try {
    const parsed = JSON.parse(content);
    const rawActions: unknown[] = parsed.actions ?? (parsed.action ? [parsed.action] : []);
    const safeActions = rawActions.filter(isValidAction).slice(0, 3);
    result = { reply: parsed.reply ?? content, ...(safeActions.length > 0 && { actions: safeActions }) };
  } catch {
    result = { reply: content || "I wasn't able to answer that. Please try again or contact support." };
  }

  // Auto-add action if AI missed it
  if (!result.actions?.length) {
    const lower = message.toLowerCase();
    const hint = actionHints.find((h) => h.keywords.some((k) => lower.includes(k)));
    if (hint) {
      result.actions = [hint.action];
    }
  }

  return result;
}
