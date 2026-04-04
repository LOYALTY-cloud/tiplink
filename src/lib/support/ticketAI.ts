import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type TicketSummaryResult = {
  summary: string;
  resolution: string;
  outcome: "resolved" | "unresolved";
};

/**
 * Generate an AI summary for a closed/resolved ticket and save it to user_support_history.
 */
export async function generateTicketSummary(ticketId: string): Promise<TicketSummaryResult | null> {
  // Fetch ticket
  const { data: ticket } = await supabaseAdmin
    .from("support_tickets")
    .select("id, user_id, category, status, subject")
    .eq("id", ticketId)
    .single();

  if (!ticket) return null;

  // Fetch messages (exclude internal notes)
  const { data: messages } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("sender_type, message, created_at")
    .eq("ticket_id", ticketId)
    .neq("is_internal", true)
    .order("created_at", { ascending: true });

  const thread = (messages ?? [])
    .map((m) => `[${m.sender_type}] ${m.message}`)
    .join("\n");

  // Check if summary already exists (idempotent)
  const { data: existing } = await supabaseAdmin
    .from("user_support_history")
    .select("id")
    .eq("ticket_id", ticketId)
    .limit(1);

  if (existing && existing.length > 0) return null;

  const prompt = `You are a support analyst.

Summarize this support ticket clearly.

Ticket subject: ${ticket.subject}
Category: ${ticket.category}
Final status: ${ticket.status}

Conversation:
${thread.slice(0, 4000)}

Return JSON only:

{
  "summary": "short description of the issue",
  "resolution": "what was done to fix it, or why it wasn't fixed",
  "outcome": "resolved" or "unresolved"
}

Rules:
- Be concise (1-2 sentences each)
- Focus on actions taken
- If the ticket was auto-closed or not fixed, explain why
- outcome must be exactly "resolved" or "unresolved"`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = completion.choices[0].message.content ?? "";
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as TicketSummaryResult;

    // Validate
    if (!parsed.summary || !parsed.resolution) return null;
    if (parsed.outcome !== "resolved" && parsed.outcome !== "unresolved") {
      parsed.outcome = ticket.status === "resolved" ? "resolved" : "unresolved";
    }

    // Save to user_support_history
    await supabaseAdmin.from("user_support_history").insert({
      user_id: ticket.user_id,
      ticket_id: ticketId,
      issue_type: ticket.category,
      summary: parsed.summary.slice(0, 500),
      resolution: parsed.resolution.slice(0, 500),
      outcome: parsed.outcome,
    });

    return parsed;
  } catch {
    return null;
  }
}

export type ReplySuggestion = {
  suggestions: string[];
};

/**
 * Generate AI-powered reply suggestions for an admin based on the ticket conversation
 * and the user's past support history (institutional memory).
 */
export async function generateReplySuggestions(ticketId: string): Promise<string[]> {
  // Fetch ticket for user_id and category
  const { data: ticket } = await supabaseAdmin
    .from("support_tickets")
    .select("user_id, category, subject")
    .eq("id", ticketId)
    .single();

  const [messagesRes, historyRes] = await Promise.all([
    supabaseAdmin
      .from("support_ticket_messages")
      .select("sender_type, message, created_at")
      .eq("ticket_id", ticketId)
      .neq("is_internal", true)
      .order("created_at", { ascending: true }),
    ticket?.user_id
      ? supabaseAdmin
          .from("user_support_history")
          .select("issue_type, summary, resolution, outcome, created_at")
          .eq("user_id", ticket.user_id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const messages = messagesRes.data ?? [];
  const history = historyRes.data ?? [];

  const thread = messages
    .map((m) => `[${m.sender_type}] ${m.message}`)
    .join("\n");

  if (!thread.trim()) return [];

  // Build history context
  let historyContext = "";
  if (history.length > 0) {
    historyContext = `\n\nUser's past support history (${history.length} previous tickets):\n` +
      history.map((h, i) =>
        `${i + 1}. [${h.outcome?.toUpperCase()}] ${h.issue_type}: ${h.summary}${h.resolution ? ` → ${h.resolution}` : ""}`
      ).join("\n");
  }

  const prompt = `You are a support assistant helping an admin reply to a user on 1neLink (a tipping platform).

Based on the conversation below, suggest 3 short, professional reply options the admin could send.
${historyContext ? `\nIMPORTANT: The user has prior support history. Use this context to personalize your replies — reference past issues if relevant, acknowledge returning users, and avoid asking for information already known.` : ""}

Current ticket: ${ticket?.subject ?? "Support request"} (${ticket?.category ?? "general"})

Conversation:
${thread.slice(0, 3000)}${historyContext}

Return JSON only:

{
  "suggestions": [
    "reply option 1",
    "reply option 2",
    "reply option 3"
  ]
}

Rules:
- Each reply should be 1-2 sentences
- Be helpful, professional, empathetic
- Include specific next steps where possible
- Vary the tone: one concise, one detailed, one closing/resolving${history.length > 0 ? "\n- Reference the user's history when it helps (e.g. 'I see you had a similar issue before...')" : ""}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 400,
    });

    const content = completion.choices[0].message.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ReplySuggestion;
    if (!Array.isArray(parsed.suggestions)) return [];

    return parsed.suggestions.filter((s) => typeof s === "string" && s.length > 0).slice(0, 3);
  } catch {
    return [];
  }
}
